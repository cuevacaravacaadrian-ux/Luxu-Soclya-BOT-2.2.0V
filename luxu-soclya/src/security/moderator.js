"use strict";

const { analyzeText, dupKey } = require("./rules");
const { severityOf, warningWeight, apiPoints, activityPoints, combine } = require("./scoring");
const discipline = require("./discipline");
const RateLimiter = require("../core/rateLimiter");
const TtlCache = require("../core/cache");
const CircuitBreaker = require("../core/circuitBreaker");

const FLAG_THRESHOLD = 35;
const BLOCKED_FLOOR = 65;
const API_CODES = { violence_threat: "threat", self_harm: "self_harm", harassment: "harassment", hate: "hate" };

/**
 * Pipeline de moderación de cada mensaje (y de cada edición):
 *  1. Exentos (admins y confiables). Los bloqueados por Luxu no están exentos.
 *  2. Actividad: flood, spam y repeticiones.
 *  3. Reglas locales y palabrotas (siempre).
 *  4. Contexto de la sala (memoria) y API de Soclya cuando hay sospecha.
 *  5. Campañas: enlaces y spam coordinado entre cuentas.
 *  6. Puntuación y gravedad -> peso del aviso -> plan de sanción según el historial.
 *  7. Ejecución: borrar, avisar, aislar, expulsar/banear y alertar.
 * Si cualquier servicio externo falla, Luxu sigue con sus reglas locales.
 */
class Moderator {
  constructor({ config, logger, store, api, outbox, memory, suspicion, alert }) {
    this.config = config;
    this.logger = logger;
    this.store = store;
    this.api = api;
    this.outbox = outbox;
    this.memory = memory;
    this.suspicion = suspicion;
    this.alert = alert;
    this.botId = null;

    this.rate = new RateLimiter(config.rateLimitWindowMs, config.rateLimitMax);
    this.spam = new RateLimiter(config.spamWindowMs, config.spamMax);
    this.repeats = new Map();
    this.cache = new TtlCache({ max: 500, ttlMs: 10 * 60_000 });
    this.breaker = new CircuitBreaker("moderacion-soclya", logger, { failureThreshold: 4, cooldownMs: 60_000 });
    this.counters = { evaluated: 0, flagged: 0, apiChecks: 0, apiFailures: 0, actions: 0 };
  }

  exempt(userId, username) {
    const name = String(username || "").replace(/^@/, "").toLowerCase();
    return this.config.ownerIds.has(userId) || this.config.adminIds.has(userId) || this.config.adminUsernames.has(name);
  }

  decayMs() {
    return this.config.warningDecayHours * 3_600_000;
  }

  activeWarnings(userId) {
    return this.store.activeWarnings(userId, this.decayMs());
  }

  ruleConfig() {
    return { ...this.config, customWords: this.store.listWords() };
  }

  sweep() {
    this.rate.sweep();
    this.spam.sweep();
    this.suspicion.sweep();
    this.memory.sweep();
    const cutoff = Date.now() - this.config.duplicateWindowMs;
    for (const [key, list] of this.repeats) {
      const fresh = list.filter(item => item.at > cutoff);
      if (fresh.length) this.repeats.set(key, fresh);
      else this.repeats.delete(key);
    }
  }

  countRepeats(key, signature) {
    const now = Date.now();
    const cutoff = now - this.config.duplicateWindowMs;
    const list = (this.repeats.get(key) || []).filter(item => item.at > cutoff);
    list.push({ signature, at: now });
    this.repeats.delete(key);
    this.repeats.set(key, list.slice(-12));
    if (this.repeats.size > 5000) this.repeats.delete(this.repeats.keys().next().value);
    return list.filter(item => item.signature === signature).length;
  }

  async askSoclya(text, contexto) {
    if (!this.config.moderationApi) return null;
    const key = dupKey(text);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    this.counters.apiChecks++;
    try {
      const result = await this.breaker.call(() => this.api.moderateText(text, contexto));
      this.cache.set(key, result);
      return result;
    } catch (err) {
      this.counters.apiFailures++;
      this.logger.warn({ err: err.message, status: err.status }, "moderacion_soclya_no_disponible_se_usan_reglas_locales");
      return null;
    }
  }

  /** Evalúa un mensaje. Devuelve el caso creado, o null si no hay nada que hacer. */
  async onMessage(evt, { edited = false } = {}) {
    if (!this.config.automod) return null;

    const message = evt.data || {};
    const author = message.autor || {};
    const userId = String(author.id ?? "");
    const messageId = String(message.id ?? "");
    const salaId = String(evt.salaId ?? message.sala_id ?? "");
    const servidorId = String(evt.servidorId ?? message.servidor_id ?? "");
    const text = typeof message.texto === "string" ? message.texto : "";

    if (!userId || !messageId || !salaId || !text.trim()) return null;
    if (author.bot || (this.botId && userId === this.botId)) return null;

    this.counters.evaluated++;
    const user = this.store.getUser(userId);
    if (author.username) user.name = String(author.username).slice(0, 64);
    if (!edited) user.messages++;
    user.lastSeen = Date.now();
    this.store.markDirty();

    if (!user.blocked && (this.exempt(userId, author.username) || user.trusted)) {
      if (!edited) this.memory.remember(salaId, { id: messageId, userId, username: user.name, text });
      return null;
    }

    const key = `${salaId}:${userId}`;
    const activity = { rate: false, spam: false, repeat: false };
    if (!edited) {
      activity.rate = this.rate.hit(key).limited;
      activity.spam = this.spam.hit(key).limited;
      activity.repeat = this.countRepeats(key, dupKey(text)) >= this.config.duplicateMax;
    }

    const local = analyzeText(text, this.ruleConfig());
    const reasons = local.signals.map(s => s.label);
    const codes = local.signals.map(s => s.code);
    if (activity.rate) { reasons.push("demasiados mensajes seguidos"); codes.push("flood"); }
    if (activity.spam) { reasons.push("flood o spam"); codes.push("flood"); }
    if (activity.repeat) { reasons.push("mensajes repetidos"); codes.push("repeat"); }
    if (user.blocked) { reasons.push(`usuario bloqueado por Luxu${user.blockReason ? `: ${user.blockReason}` : ""}`); codes.push("blocked"); }

    const warnings = this.activeWarnings(userId);
    const previous = this.memory.previousText(salaId);
    const suspicious = local.points > 0 || reasons.length > 0 || edited || warnings > 0 || user.messages <= 5;
    const api = suspicious ? await this.askSoclya(text, previous) : null;
    if (api && api.accion && api.accion !== "permitir") {
      reasons.push(api.motivo || `Soclya marca: ${(api.categorias || []).join(", ") || "contenido"}`);
      codes.push(...(api.categorias || []).map(c => API_CODES[c] || "api"));
    }

    const campaign = this.suspicion.observe({ salaId, userId, text, edited });
    reasons.push(...campaign.reasons);
    codes.push(...campaign.codes);
    for (const alert of campaign.alerts) this.alert(alert.text, { kind: "campana" });

    // Puntuación del propio mensaje (sin historial) y la final (con el bonus de avisos activos).
    // El peso del aviso usa solo la primera: la reincidencia sube por la escalera, no inflando cada caso.
    const own = {
      local: local.points,
      activity: activityPoints(activity),
      api: apiPoints(api) + campaign.points,
      sensitivity: this.config.sensitivity
    };
    let ownScore = combine({ ...own, warnings: 0 });
    let score = combine({ ...own, warnings });
    if (user.blocked) {
      ownScore = Math.max(ownScore, BLOCKED_FLOOR);
      score = Math.max(score, BLOCKED_FLOOR);
    }

    if (score < FLAG_THRESHOLD) {
      if (!edited) this.memory.remember(salaId, { id: messageId, userId, username: user.name, text });
      return null;
    }

    this.counters.flagged++;
    const severity = severityOf(score);
    const caseItem = this.store.addCase({
      userId,
      userName: user.name,
      salaId,
      servidorId,
      messageId,
      score,
      severity,
      reasons: [...new Set(reasons)].slice(0, 8),
      codes: [...new Set(codes)],
      fragment: text.slice(0, 200),
      edited,
      api: api ? { accion: api.accion, confianza: api.confianza, categorias: api.categorias || [] } : null,
      actions: []
    });

    this.store.addWarning(userId, Math.max(1, warningWeight(severityOf(ownScore))), caseItem.id);
    const total = this.activeWarnings(userId);
    const plan = discipline.plan({ total, severity, codes: caseItem.codes, cfg: this.config });
    caseItem.level = plan.level;
    caseItem.warningsAfter = total;

    const executed = await this.enforce({
      plan,
      caseItem,
      severity,
      userId,
      userName: user.name,
      salaId,
      servidorId,
      messageId,
      reasons: caseItem.reasons
    });
    caseItem.actions = executed;
    this.counters.actions += executed.length;
    this.store.incMetric("flagged");
    this.store.audit({ type: "moderacion", caseId: caseItem.id, userId, severity, score, level: plan.level, actions: executed });
    this.logger.warn({ caseId: caseItem.id, userId, score, severity, nivel: plan.level, motivos: caseItem.reasons }, "moderacion_caso");
    return caseItem;
  }

  /**
   * Ejecuta un plan de sanción. messageId es opcional: en acciones manuales no hay mensaje que borrar.
   * Devuelve la lista de acciones realizadas (o simuladas si LUXU_ACTIONS_ENABLED=false).
   */
  async enforce({ plan, caseItem, severity, userId, userName, salaId, servidorId, messageId, reasons }) {
    const done = [];
    const motivo = (reasons[0] || "contenido no permitido").slice(0, 120);
    const critical = severity === "critical";

    const run = async (label, task, { destructive = true } = {}) => {
      if (destructive && !this.config.actionsEnabled) {
        done.push(`(simulado) ${label}`);
        return;
      }
      const result = await this.outbox.run(label, task, { critical });
      if (result.ok) done.push(label);
      else this.logger.warn({ caseId: caseItem.id, accion: label, err: result.error?.message }, "accion_fallida");
    };

    if (messageId && plan.level > 0) {
      await run("borrar_mensaje", () => this.api.deleteMessage(salaId, messageId));
    }

    for (const step of discipline.render(plan, { name: userName, motivo })) {
      if (step.type === "aviso") {
        await run("aviso", () => this.api.sendMessage(salaId, step.text));
      } else if (step.type === "aislar") {
        if (!servidorId) continue;
        await run(`aislar_${step.minutos}min`, () => this.api.moderateMember(servidorId, userId, {
          accion: "aislar", minutos: step.minutos, motivo: `Luxu: ${motivo}`
        }));
        await run("aviso", () => this.api.sendMessage(salaId, step.text));
      } else if (step.type === "expulsar" || step.type === "banear") {
        if (!servidorId) continue;
        await run(step.type, () => this.api.moderateMember(servidorId, userId, {
          accion: step.type, motivo: `Luxu: ${motivo}`
        }));
        await run("aviso", () => this.api.sendMessage(salaId, step.text));
      }
    }

    if (plan.alert) {
      const alertText = [
        `🛡️ Luxu · ${severity.toUpperCase()} · nivel ${plan.level} · caso ${caseItem.id.slice(0, 8)}`,
        `Usuario: ${userName ? `@${userName}` : "?"} (${userId}) · sala ${salaId}${messageId ? ` · mensaje ${messageId}` : ""}`,
        `Acciones: ${done.join(", ") || "ninguna"}`,
        `Motivos: ${reasons.slice(0, 5).join(" · ")}`
      ].join("\n");
      await this.alert(alertText, { kind: "sancion" });
    }
    return done;
  }
}

module.exports = Moderator;
