"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DAY_MS = 86_400_000;
const LIMITS = { cases: 5000, audit: 10000, polls: 500, reports: 500, warnings: 50, words: 500 };

function defaultState() {
  return {
    version: 3,
    users: {},
    cases: [],
    audit: [],
    polls: {},
    reports: [],
    words: [],
    watch: {},
    metrics: { evaluated: 0, flagged: 0, actions: 0, events: 0, commands: 0, errors: 0, startedAt: Date.now() }
  };
}

const pushBounded = (list, item, max) => {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
  return list;
};

/**
 * Memoria a largo plazo en JSON: usuarios, avisos, casos, reportes, palabras y vigilancia.
 * Escritura atómica con debounce; si el fichero se corrompe, se respalda.
 */
class Store {
  constructor(dataDir, logger) {
    this.dir = dataDir;
    this.file = path.join(dataDir, "state.json");
    this.logger = logger;
    fs.mkdirSync(dataDir, { recursive: true });
    this.state = this.load();
    this.dirty = false;
    this.timer = null;
  }

  load() {
    if (!fs.existsSync(this.file)) return defaultState();
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      const base = defaultState();
      return { ...base, ...raw, metrics: { ...base.metrics, ...(raw.metrics || {}) } };
    } catch (err) {
      const backup = `${this.file}.corrupto-${Date.now()}`;
      try { fs.renameSync(this.file, backup); } catch {}
      this.logger.error({ err: err.message, backup }, "estado_corrupto_respaldado");
      return defaultState();
    }
  }

  markDirty() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 1000);
    this.timer.unref?.();
  }

  flush() {
    if (!this.dirty) return true;
    this.dirty = false;
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.state));
      fs.renameSync(tmp, this.file);
      return true;
    } catch (err) {
      this.dirty = true;
      this.logger.error({ err: err.message }, "estado_no_guardado");
      return false;
    }
  }

  // ----- Usuarios, avisos y confianza -----

  getUser(id) {
    const key = String(id);
    let user = this.state.users[key];
    if (!user) {
      user = { name: "", firstSeen: Date.now(), messages: 0, lastSeen: 0, trusted: false, blocked: false, blockReason: "", warnings: [] };
      this.state.users[key] = user;
    }
    if (!Array.isArray(user.warnings)) user.warnings = [];
    return user;
  }

  peekUser(id) {
    return this.state.users[String(id)] || null;
  }

  setFlag(id, flag, value) {
    this.getUser(id)[flag] = Boolean(value);
    this.markDirty();
  }

  addWarning(id, weight, caseId) {
    if (!weight) return;
    pushBounded(this.getUser(id).warnings, { at: Date.now(), weight, caseId }, LIMITS.warnings);
    this.markDirty();
  }

  /** Suma de pesos de los avisos que siguen activos (dentro de la ventana de caducidad). */
  activeWarnings(id, decayMs, now = Date.now()) {
    const user = this.peekUser(id);
    if (!user) return 0;
    return user.warnings.reduce((sum, w) => (now - w.at < decayMs ? sum + w.weight : sum), 0);
  }

  clearWarnings(id) {
    this.getUser(id).warnings = [];
    this.markDirty();
  }

  // ----- Casos -----

  addCase(data) {
    const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data };
    pushBounded(this.state.cases, item, LIMITS.cases);
    this.markDirty();
    return item;
  }

  findCase(prefix) {
    const wanted = String(prefix || "").trim().toLowerCase();
    if (!wanted) return null;
    return this.state.cases.filter(c => c.id.toLowerCase().startsWith(wanted)).pop() || null;
  }

  recentCases(limit = 10) {
    return this.state.cases.slice(-limit).reverse();
  }

  casesFor(userId, limit = 5) {
    return this.state.cases.filter(c => c.userId === String(userId)).slice(-limit).reverse();
  }

  // ----- Reportes -----

  addReport(report) {
    pushBounded(this.state.reports, { id: crypto.randomUUID(), at: new Date().toISOString(), ...report }, LIMITS.reports);
    this.markDirty();
  }

  reportsAbout(username, limit = 50) {
    const wanted = String(username || "").toLowerCase();
    return this.state.reports.filter(r => String(r.target || "").toLowerCase() === wanted).slice(-limit);
  }

  // ----- Palabras propias -----

  addWord(word, tier = "medium") {
    const clean = String(word || "").trim().toLowerCase();
    if (!clean || this.state.words.some(w => w.word === clean)) return false;
    pushBounded(this.state.words, { word: clean, tier }, LIMITS.words);
    this.markDirty();
    return true;
  }

  removeWord(word) {
    const clean = String(word || "").trim().toLowerCase();
    const before = this.state.words.length;
    this.state.words = this.state.words.filter(w => w.word !== clean);
    this.markDirty();
    return this.state.words.length !== before;
  }

  listWords() {
    return [...this.state.words];
  }

  // ----- Vigilancia del servidor -----

  getWatch(serverId) {
    return this.state.watch[String(serverId)] || null;
  }

  setWatch(serverId, snapshot) {
    this.state.watch[String(serverId)] = snapshot;
    this.markDirty();
  }

  watchedIds() {
    return Object.keys(this.state.watch);
  }

  dropWatch(serverId) {
    delete this.state.watch[String(serverId)];
    this.markDirty();
  }

  // ----- Auditoría, encuestas y métricas -----

  audit(entry) {
    pushBounded(this.state.audit, { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry }, LIMITS.audit);
    this.markDirty();
  }

  auditSince(type, since) {
    return this.state.audit.filter(a => a.type === type && Date.parse(a.at) >= since);
  }

  savePoll(id, poll) {
    this.state.polls[`p_${id}`] = poll;
    const keys = Object.keys(this.state.polls);
    for (const key of keys.slice(0, Math.max(0, keys.length - LIMITS.polls))) delete this.state.polls[key];
    this.markDirty();
  }

  getPoll(id) {
    return this.state.polls[`p_${id}`] || null;
  }

  incMetric(name, amount = 1) {
    this.state.metrics[name] = (this.state.metrics[name] || 0) + amount;
    this.markDirty();
  }

  /** Limpieza periódica: avisos caducados y usuarios inactivos sin historial. */
  maintain(now = Date.now()) {
    const cutoff = now - 30 * DAY_MS;
    for (const [id, user] of Object.entries(this.state.users)) {
      user.warnings = (user.warnings || []).filter(w => w.at >= cutoff);
      const inactive = user.lastSeen < cutoff && !user.trusted && !user.blocked && user.warnings.length === 0;
      if (inactive) delete this.state.users[id];
    }
    this.markDirty();
  }

  stats() {
    return { ...this.state.metrics };
  }
}

module.exports = Store;
