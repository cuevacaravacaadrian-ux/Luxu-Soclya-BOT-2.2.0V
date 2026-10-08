"use strict";

const crypto = require("crypto");
const fun = require("./fun");
const { DIVERTIR, HELP } = require("./content");
const { analyzeText, normalize } = require("../security/rules");
const discipline = require("../security/discipline");
const RateLimiter = require("../core/rateLimiter");

const MAX_POLL_OPTIONS = 5;
const MAX_POLL_QUESTION = 200;
const MOD_ACTIONS = ["aislar", "expulsar", "banear"];
const WORD_ACTIONS = ["anadir", "quitar", "listar"];
const MIN_WORD_LENGTH = 3;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function pollButtons(pollId, poll) {
  return poll.opciones.map((label, index) => ({ id: `${pollId}.${index}`, etiqueta: label.slice(0, 40), estilo: "principal" }));
}

function pollText(poll) {
  const counts = poll.opciones.map(() => 0);
  for (const choice of Object.values(poll.votos)) counts[choice] = (counts[choice] || 0) + 1;
  const total = counts.reduce((sum, n) => sum + n, 0);
  const lines = poll.opciones.map((label, i) => {
    const pct = total ? Math.round((counts[i] / total) * 100) : 0;
    return `${label}: **${counts[i]}** (${pct}%)`;
  });
  return `📊 **${poll.pregunta}**\n${lines.join("\n")}\nVotos: ${total}`;
}

/**
 * Enrutador de interacciones de Soclya: comandos con barra, botones y menciones.
 * Cada interacción se responde una sola vez (salvo respuestas efímeras).
 */
class InteractionRouter {
  constructor({ config, logger, store, api, outbox, moderator, ai, memory, alert, watcher, status }) {
    Object.assign(this, { config, logger, store, api, outbox, moderator, ai, memory, alert, watcher, status });
    this.reportLimiter = new RateLimiter(60_000, 1);

    this.handlers = {
      ayuda: () => ({ texto: HELP }),
      estado: () => ({ texto: this.statusText(), efimero: false }),
      perfil: ctx => this.profile(ctx),
      normas: () => ({ texto: `📜 **Normas de la comunidad**\n${this.config.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}` }),
      resumen: ctx => this.summary(ctx),
      reportar: ctx => this.report(ctx),
      divertir: ({ opts }) => ({ texto: fun.pick(DIVERTIR[opts.tipo] || DIVERTIR.chiste) }),

      dado: ({ opts }) => {
        const roll = fun.rollDice(opts.caras ?? 6);
        return { texto: `🎲 Ha salido un **${roll.value}** (d${roll.faces})` };
      },
      moneda: () => ({ texto: `🪙 **${fun.flipCoin()}**` }),
      "8ball": ({ opts }) => {
        const blocked = this.checkInput(opts.pregunta);
        if (blocked) return { texto: blocked, efimero: true };
        return { texto: `🎱 *${normalize(opts.pregunta)}*\n${fun.eightBall()}` };
      },
      ppt: ({ opts }) => ({ texto: fun.rpsText(fun.rps(opts.jugada)) }),
      ship: ({ opts }) => {
        const blocked = this.checkInput(opts.primera, opts.segunda);
        if (blocked) return { texto: blocked, efimero: true };
        const result = fun.ship(opts.primera, opts.segunda);
        return { texto: `💞 **${normalize(opts.primera)}** + **${normalize(opts.segunda)}** = **${result.percent}%**\n${result.label}` };
      },
      elige: ({ opts }) => {
        const blocked = this.checkInput(opts.opciones);
        if (blocked) return { texto: blocked, efimero: true };
        const items = fun.splitList(opts.opciones, { min: 2, max: 20 });
        if (!items) return { texto: "Necesito al menos dos opciones separadas por comas.", efimero: true };
        return { texto: `🎯 Elijo: **${fun.pick(items)}**` };
      },
      encuesta: ({ opts }) => {
        const blocked = this.checkInput(opts.pregunta, opts.opciones);
        if (blocked) return { texto: blocked, efimero: true };
        const options = fun.splitList(opts.opciones, { min: 2, max: MAX_POLL_OPTIONS, maxItemLength: 40 });
        if (!options) return { texto: "La encuesta necesita de 2 a 5 opciones separadas por comas.", efimero: true };
        const pollId = crypto.randomBytes(4).toString("hex");
        const poll = { pregunta: normalize(opts.pregunta).slice(0, MAX_POLL_QUESTION), opciones: options, votos: {}, creadaEn: Date.now() };
        this.store.savePoll(pollId, poll);
        return { texto: pollText(poll), botones: pollButtons(pollId, poll) };
      },
      preguntar: async ({ opts, userId, username }) => ({ texto: await this.ai.answer(opts.pregunta, { userId, username }) }),

      casos: ctx => this.adminOnly(ctx, () => {
        if (ctx.opts.id) return this.caseDetail(ctx);
        const list = this.store.recentCases(8);
        const texto = list.length
          ? list.map(c => `\`${c.id.slice(0, 8)}\` · ${c.severity} · nivel ${c.level ?? "-"} · @${c.userName || c.userId} · ${c.score}/100`).join("\n")
          : "No hay casos registrados.";
        return { texto, efimero: true };
      }),
      historial: ctx => this.history(ctx),
      advertir: ctx => this.adminOnly(ctx, () => this.manualWarning(ctx)),
      perdonar: ctx => this.adminOnly(ctx, () => this.forgive(ctx)),
      confiar: ctx => this.adminOnly(ctx, () => this.flag(ctx, "trusted", ctx.opts.activo ?? true, "confiable", "sin confianza")),
      bloquear: ctx => this.adminOnly(ctx, () => this.block(ctx)),
      moderar: ctx => this.adminOnly(ctx, () => this.manualAction(ctx)),
      palabras: ctx => this.adminOnly(ctx, () => this.words(ctx)),
      sospechosos: ctx => this.adminOnly(ctx, () => this.suspects()),
      vigilancia: ctx => this.adminOnly(ctx, () => ({ texto: this.watchText(), efimero: true }))
    };
  }

  // ----- Entrada principal -----

  async onInteraction(evt) {
    const data = evt.data || {};
    if (!data.id) return;
    switch (data.tipo) {
      case "comando": return this.onCommand(data, evt);
      case "boton": return this.onButton(data);
      case "mencion": return this.onMention(data);
      default: return undefined;
    }
  }

  async respond(data, payload) {
    const result = await this.outbox.run("responder_interaccion", () => this.api.respondInteraction(data.id, payload));
    if (!result.ok) this.logger.warn({ err: result.error?.message, status: result.error?.status }, "respuesta_interaccion_fallida");
    return result.ok;
  }

  async write(label, task) {
    const result = await this.outbox.run(label, task);
    if (!result.ok) throw result.error;
    return result.value;
  }

  async onCommand(data, evt) {
    const name = data.comando?.nombre;
    if (!name) return;
    const ctx = {
      opts: data.comando.opciones || {},
      userId: String(data.autor?.id ?? ""),
      username: data.autor?.username ?? "",
      servidorId: String(data.servidor?.id ?? evt.servidorId ?? ""),
      salaId: String(data.sala?.id ?? evt.salaId ?? "")
    };
    this.store.incMetric("commands");

    const handler = this.handlers[name];
    if (!handler) return this.respond(data, { texto: "Ese comando ya no existe. Prueba /ayuda.", efimero: true });
    try {
      const payload = await handler(ctx);
      if (payload) await this.respond(data, payload);
    } catch (err) {
      this.store.incMetric("errors");
      this.logger.error({ err: err.message, status: err.status, comando: name }, "comando_fallido");
      const texto = err.status === 403
        ? "No tengo permisos para hacer eso en esta sala."
        : "Algo salió mal con ese comando. Inténtalo de nuevo.";
      await this.respond(data, { texto, efimero: true });
    }
  }

  async onButton(data) {
    const [pollId, indexRaw] = String(data.boton?.id || "").split(".");
    const index = Number(indexRaw);
    const userId = String(data.autor?.id ?? "");
    const poll = pollId ? this.store.getPoll(pollId) : null;
    if (!poll || !userId || !Number.isInteger(index) || index < 0 || index >= poll.opciones.length) {
      return this.respond(data, { texto: "Esta encuesta ya no está disponible.", efimero: true });
    }
    poll.votos[userId] = index;
    this.store.markDirty();
    return this.respond(data, { texto: pollText(poll), botones: pollButtons(pollId, poll), actualizar: true });
  }

  async onMention(data) {
    const question = normalize(data.mensaje?.texto || "").replace(/@[\p{L}\p{N}_.-]+/gu, "").trim();
    const userId = String(data.autor?.id ?? "");
    if (!question) return this.respond(data, { texto: "¿En qué te ayudo? Escribe tu pregunta después de mencionarme." });
    try {
      const texto = await this.ai.answer(question, { userId, username: data.autor?.username });
      return await this.respond(data, { texto });
    } catch (err) {
      this.store.incMetric("errors");
      this.logger.error({ err: err?.message }, "mencion_fallida");
      return this.respond(data, { texto: "Algo salió mal al contestarte. Inténtalo de nuevo." });
    }
  }

  // ----- Comunidad -----

  async profile(ctx) {
    let target = { id: ctx.userId, username: ctx.username };
    if (ctx.opts.usuario) {
      if (!this.isAdmin(ctx)) return { texto: "Solo puedes ver tu propio perfil.", efimero: true };
      target = await this.resolveMember(ctx, ctx.opts.usuario);
      if (!target) return this.notFound(ctx.opts.usuario);
    }
    const user = this.store.peekUser(target.id) || { messages: 0, trusted: false, blocked: false, warnings: [] };
    const warnings = this.moderator.activeWarnings(target.id);
    const last = this.store.casesFor(target.id, 1)[0];
    const reports = this.store.reportsAbout(target.username).length;
    const estado = [user.trusted ? "confiable" : null, user.blocked ? "bloqueado" : null].filter(Boolean).join(", ") || "normal";
    const texto = [
      `👤 **@${target.username}** · ${estado}`,
      `Mensajes revisados: ${user.messages || 0}`,
      `Avisos activos: ${warnings} (nivel de sanción ${discipline.plan({ total: warnings, severity: "low", cfg: this.config }).level})`,
      `Último caso: ${last ? `${last.severity} · ${last.createdAt.slice(0, 10)}` : "ninguno"}`,
      `Reportes recibidos: ${reports}`
    ].join("\n");
    return { texto, efimero: true };
  }

  summary(ctx) {
    const s = this.memory.summary(ctx.salaId);
    if (!s.total) return { texto: "Todavía no tengo mensajes recientes de esta sala.", efimero: true };
    const top = s.top.map(t => `@${t.username} (${t.count})`).join(", ");
    const base = `📝 Últimos ${s.total} mensajes · ${s.participants} participantes · más activos: ${top}` +
      (s.keywords.length ? ` · temas: ${s.keywords.join(", ")}` : "");
    return { texto: base, efimero: false };
  }

  async report(ctx) {
    if (!ctx.opts.usuario || !ctx.opts.motivo) return { texto: "Indica a quién reportas y el motivo.", efimero: true };
    if (this.reportLimiter.hit(ctx.userId).limited) {
      return { texto: "Ya has enviado un reporte hace un momento. Espera un minuto.", efimero: true };
    }
    const target = String(ctx.opts.usuario).replace(/^@/, "");
    const motivo = this.checkInput(ctx.opts.motivo) ? "(contenido filtrado)" : normalize(ctx.opts.motivo).slice(0, 300);
    this.store.addReport({ from: ctx.userId, fromName: ctx.username, target, motivo, salaId: ctx.salaId });
    await this.alert(`📣 Reporte de @${ctx.username} sobre @${target} en la sala ${ctx.salaId}.\nMotivo: ${motivo}`, { kind: "reporte" });
    return { texto: "Gracias. Tu reporte ha llegado a los moderadores.", efimero: true };
  }

  // ----- Admin -----

  /**
   * Historial de sanciones de una persona en todos los servidores donde Luxu está instalado.
   * Solo owners. No muestra mensajes, solo cuántas sanciones hay y dónde. Queda auditado.
   */
  async history(ctx) {
    if (!this.isOwner(ctx)) return { texto: "El historial entre servidores solo lo ven los owners de Luxu.", efimero: true };
    const wanted = String(ctx.opts.usuario || "").replace(/^@/, "").toLowerCase();
    if (!wanted) return { texto: "Indica el usuario, por ejemplo /historial usuario:@nombre.", efimero: true };

    const cases = this.store.state.cases.filter(c => String(c.userName || "").toLowerCase() === wanted);
    this.store.audit({ type: "historial", actorId: ctx.userId, target: wanted, resultados: cases.length });
    if (!cases.length) return { texto: `No hay sanciones registradas para @${wanted}.`, efimero: true };

    const byServer = new Map();
    for (const c of cases) {
      const key = c.servidorId || "desconocido";
      const row = byServer.get(key) || { total: 0, maxLevel: 0, expulsiones: 0, aislamientos: 0 };
      row.total++;
      row.maxLevel = Math.max(row.maxLevel, c.level || 0);
      if ((c.actions || []).some(a => /expulsar|banear/.test(a))) row.expulsiones++;
      if ((c.actions || []).some(a => /aislar/.test(a))) row.aislamientos++;
      byServer.set(key, row);
    }
    const rows = [...byServer.entries()].sort((a, b) => b[1].total - a[1].total);
    const totals = rows.reduce((t, [, r]) => ({
      total: t.total + r.total, expulsiones: t.expulsiones + r.expulsiones, aislamientos: t.aislamientos + r.aislamientos
    }), { total: 0, expulsiones: 0, aislamientos: 0 });

    const lines = rows.map(([server, r]) =>
      `• Servidor ${server}: ${r.total} casos · nivel máximo ${r.maxLevel} · aislamientos ${r.aislamientos} · expulsiones/baneos ${r.expulsiones}`);
    return {
      texto: [`📚 Historial de @${wanted} (${rows.length} servidor/es)`,
        `Total: ${totals.total} casos · aislamientos ${totals.aislamientos} · expulsiones/baneos ${totals.expulsiones}`,
        ...lines].join("\n"),
      efimero: true
    };
  }

  caseDetail(ctx) {
    const c = this.store.findCase(ctx.opts.id);
    if (!c) return { texto: "No encuentro ese caso.", efimero: true };
    const acciones = c.actions?.length ? c.actions.join(", ") : "ninguna";
    return {
      texto: [
        `Caso \`${c.id.slice(0, 8)}\` · ${c.severity} · ${c.score}/100 · nivel ${c.level ?? "-"}`,
        `Usuario: @${c.userName || "?"} (${c.userId}) · sala ${c.salaId}`,
        `Motivos: ${c.reasons.join(" · ")}`,
        `Fragmento: "${c.fragment}"`,
        `Acciones: ${acciones}`,
        `Fecha: ${c.createdAt}`
      ].join("\n"),
      efimero: true
    };
  }

  async manualWarning(ctx) {
    const target = await this.resolveMember(ctx, ctx.opts.usuario);
    if (!target) return this.notFound(ctx.opts.usuario);
    const motivo = normalize(ctx.opts.motivo || "sin motivo").slice(0, 200);
    const caseItem = this.store.addCase({
      userId: target.id, userName: target.username, salaId: ctx.salaId, servidorId: ctx.servidorId,
      messageId: null, score: 40, severity: "medium", reasons: [`advertencia manual: ${motivo}`],
      codes: ["manual"], fragment: "", edited: false, api: null, actions: [], manualBy: ctx.userId
    });
    this.store.addWarning(target.id, 1, caseItem.id);
    const total = this.moderator.activeWarnings(target.id);
    const plan = discipline.plan({ total, severity: "medium", codes: ["manual"], cfg: this.config });
    caseItem.level = plan.level;
    const done = await this.moderator.enforce({
      plan, caseItem, severity: "medium", userId: target.id, userName: target.username,
      salaId: ctx.salaId, servidorId: ctx.servidorId, messageId: null, reasons: caseItem.reasons
    });
    caseItem.actions = done;
    this.store.audit({ type: "advertencia", actorId: ctx.userId, targetId: target.id, nivel: plan.level, motivo });
    return { texto: `✅ Aviso aplicado a @${target.username} (nivel ${plan.level}).`, efimero: true };
  }

  forgive(ctx) {
    return this.resolveMember(ctx, ctx.opts.usuario).then(target => {
      if (!target) return this.notFound(ctx.opts.usuario);
      this.store.clearWarnings(target.id);
      this.store.audit({ type: "perdon", actorId: ctx.userId, targetId: target.id });
      return { texto: `✅ Avisos activos de @${target.username} borrados.`, efimero: true };
    });
  }

  flag(ctx, flagName, value, onLabel, offLabel) {
    return this.resolveMember(ctx, ctx.opts.usuario).then(target => {
      if (!target) return this.notFound(ctx.opts.usuario);
      this.store.setFlag(target.id, flagName, value);
      this.store.audit({ type: flagName, actorId: ctx.userId, targetId: target.id, value: Boolean(value) });
      return { texto: `✅ @${target.username} marcado como ${value ? onLabel : offLabel}.`, efimero: true };
    });
  }

  block(ctx) {
    return this.resolveMember(ctx, ctx.opts.usuario).then(target => {
      if (!target) return this.notFound(ctx.opts.usuario);
      const active = ctx.opts.activo ?? true;
      this.store.setFlag(target.id, "blocked", active);
      if (active) this.store.getUser(target.id).blockReason = normalize(ctx.opts.motivo || "").slice(0, 120);
      this.store.audit({ type: "bloqueo", actorId: ctx.userId, targetId: target.id, value: active, motivo: ctx.opts.motivo || "" });
      return { texto: `✅ @${target.username} ${active ? "bloqueado: Luxu moderará todo lo que escriba" : "liberado"}.`, efimero: true };
    });
  }

  async manualAction(ctx) {
    const target = await this.resolveMember(ctx, ctx.opts.usuario);
    if (!target) return this.notFound(ctx.opts.usuario);
    const accion = ctx.opts.accion;
    if (!MOD_ACTIONS.includes(accion)) return { texto: "Acción no válida.", efimero: true };
    const minutos = accion === "aislar" ? clamp(ctx.opts.minutos ?? this.config.timeoutMinutes, 1, 10080) : undefined;
    const motivo = ctx.opts.motivo ? `Admin: ${normalize(ctx.opts.motivo)}` : `Acción manual de ${ctx.username || "un admin"}`;
    await this.write("moderar_miembro", () => this.api.moderateMember(ctx.servidorId, target.id, { accion, minutos, motivo }));
    this.store.audit({ type: "moderar", actorId: ctx.userId, targetId: target.id, accion, minutos, motivo });
    return { texto: `✅ ${accion} aplicado a @${target.username}${minutos ? ` durante ${minutos} min` : ""}.`, efimero: true };
  }

  words(ctx) {
    const accion = ctx.opts.accion;
    if (!WORD_ACTIONS.includes(accion)) return { texto: "Acción no válida.", efimero: true };
    if (accion === "listar") {
      const list = this.store.listWords();
      return { texto: list.length ? `Palabras propias: ${list.map(w => w.word).join(", ")}` : "No hay palabras propias.", efimero: true };
    }
    const word = normalize(ctx.opts.palabra || "").toLowerCase();
    if (word.length < MIN_WORD_LENGTH) return { texto: `La palabra debe tener al menos ${MIN_WORD_LENGTH} letras.`, efimero: true };
    if (accion === "anadir") {
      const added = this.store.addWord(word, "medium");
      return { texto: added ? `✅ Palabra añadida: «${word}».` : "Esa palabra ya estaba en la lista.", efimero: true };
    }
    const removed = this.store.removeWord(word);
    return { texto: removed ? `✅ Palabra quitada: «${word}».` : "Esa palabra no estaba en la lista.", efimero: true };
  }

  suspects() {
    const now = Date.now();
    const rows = Object.entries(this.store.state.users)
      .map(([id, u]) => ({ id, name: u.name, warnings: this.store.activeWarnings(id, this.moderator.decayMs(), now) }))
      .filter(u => u.warnings > 0)
      .sort((a, b) => b.warnings - a.warnings)
      .slice(0, 10);
    if (!rows.length) return { texto: "No hay usuarios con avisos activos. 🎉", efimero: true };
    return { texto: rows.map(r => `@${r.name || r.id} · avisos ${r.warnings} · nivel ${discipline.plan({ total: r.warnings, severity: "low", cfg: this.config }).level}`).join("\n"), efimero: true };
  }

  watchText() {
    const w = this.watcher.status();
    const lines = [
      `Servidores vigilados: ${w.servidores}`,
      `Última revisión: ${w.ultimaRevision}`,
      `Cambios en 24 h: ${w.cambiosUltimas24h}`
    ];
    if (w.error) lines.push(`Último error: ${w.error}`);
    if (w.recientes.length) lines.push(`Recientes:\n- ${w.recientes.join("\n- ")}`);
    return lines.join("\n");
  }

  // ----- Utilidades -----

  checkInput(...values) {
    for (const value of values) {
      if (!value) continue;
      if (analyzeText(value, this.moderator.ruleConfig()).points >= 35) {
        return "Ese texto no se puede usar aquí. Prueba con otras palabras.";
      }
    }
    return null;
  }

  isOwner(ctx) {
    return this.config.ownerIds.has(ctx.userId);
  }

  isAdmin(ctx) {
    const name = String(ctx.username || "").replace(/^@/, "").toLowerCase();
    return this.config.ownerIds.has(ctx.userId) || this.config.adminIds.has(ctx.userId) || this.config.adminUsernames.has(name);
  }

  adminOnly(ctx, task) {
    if (!this.isAdmin(ctx)) return { texto: "Solo los administradores de Luxu pueden usar este comando.", efimero: true };
    return task();
  }

  notFound(username) {
    return { texto: `No encuentro a @${username || "?"} en este servidor.`, efimero: true };
  }

  async resolveMember(ctx, username) {
    if (!username || !ctx.servidorId) return null;
    const wanted = String(username).replace(/^@/, "").toLowerCase();
    const members = await this.api.searchMembers(ctx.servidorId, wanted);
    const hit = members.find(m => String(m.username ?? "").toLowerCase() === wanted);
    return hit ? { id: String(hit.id), username: hit.username } : null;
  }

  statusText() {
    const s = this.status();
    const m = this.moderator.counters;
    const minutes = Math.floor(s.uptimeMs / 60000);
    return [
      `🛡️ **Luxu** · seguridad ${this.config.securityLevel}% · comunidad ${this.config.communityLevel}%`,
      `Gateway: ${s.gateway} · Moderación Soclya: ${s.moderacionSoclya} · IA: ${s.ia} · Vigilancia: ${this.config.watchEnabled ? "activa" : "desactivada"}`,
      `Mensajes revisados: ${m.evaluated} · Casos: ${m.flagged} · Acciones: ${m.actions}`,
      `Uptime: ${Math.floor(minutes / 60)} h ${minutes % 60} min`
    ].join("\n");
  }
}

module.exports = InteractionRouter;
