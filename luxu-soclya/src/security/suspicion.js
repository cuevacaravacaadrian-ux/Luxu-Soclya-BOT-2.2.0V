"use strict";

const { links, dupKey } = require("./text");

const TRUSTED_DOMAINS = new Set(["soclya.com", "youtube.com", "youtu.be", "github.com", "wikipedia.org"]);
const LINK_WINDOW_MS = 10 * 60_000;
const DUP_WINDOW_MS = 60_000;
const JOIN_WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 10 * 60_000;

/**
 * Detección de actividad sospechosa que no depende de una sola cuenta:
 *  - campañas de enlaces: el mismo dominio lo comparten varias cuentas en poco tiempo
 *  - spam coordinado: el mismo texto de varias cuentas a la vez
 *  - raids: entran muchos miembros nuevos en un minuto
 */
class Suspicion {
  constructor(cfg, { now = () => Date.now() } = {}) {
    this.cfg = cfg;
    this.now = now;
    this.linkUsers = new Map();
    this.dupUsers = new Map();
    this.joins = new Map();
    this.cooldown = new Map();
  }

  allowAlert(key) {
    const now = this.now();
    const last = this.cooldown.get(key);
    if (last !== undefined && now - last < ALERT_COOLDOWN_MS) return false;
    this.cooldown.set(key, now);
    if (this.cooldown.size > 500) this.cooldown.delete(this.cooldown.keys().next().value);
    return true;
  }

  /** Revisa un mensaje en el contexto de los demás. Devuelve puntos, códigos y alertas. */
  observe({ salaId, userId, text, edited = false }) {
    const result = { points: 0, codes: [], reasons: [], alerts: [] };
    if (edited) return result;
    const now = this.now();

    for (const url of links(text)) {
      let domain;
      try {
        domain = new URL(url.startsWith("www.") ? `https://${url}` : url).hostname.replace(/^www\./, "");
      } catch {
        continue;
      }
      if (TRUSTED_DOMAINS.has(domain)) continue;
      const users = this.linkUsers.get(domain) || new Map();
      users.set(String(userId), now);
      for (const [id, at] of users) if (now - at > LINK_WINDOW_MS) users.delete(id);
      this.linkUsers.set(domain, users);
      if (this.linkUsers.size > 2000) this.linkUsers.delete(this.linkUsers.keys().next().value);

      if (users.size >= (this.cfg.linkCampaignUsers ?? 3)) {
        result.points = Math.max(result.points, 25);
        result.codes.push("link_campaign");
        result.reasons.push(`posible campaña de enlaces (${domain})`);
        if (this.allowAlert(`link:${domain}`)) {
          result.alerts.push({ key: `link:${domain}`, text: `🕵️ Posible campaña de enlaces: «${domain}» compartido por ${users.size} cuentas en 10 min.` });
        }
      }
    }

    const sig = dupKey(text);
    if (sig.length >= 12) {
      const key = `${salaId}|${sig}`;
      const users = this.dupUsers.get(key) || new Map();
      users.set(String(userId), now);
      for (const [id, at] of users) if (now - at > DUP_WINDOW_MS) users.delete(id);
      this.dupUsers.set(key, users);
      if (this.dupUsers.size > 2000) this.dupUsers.delete(this.dupUsers.keys().next().value);

      if (users.size >= (this.cfg.coordinatedUsers ?? 4)) {
        result.points = Math.max(result.points, 30);
        result.codes.push("coordinated_spam");
        result.reasons.push("mismo mensaje de varias cuentas a la vez");
        if (this.allowAlert(`dup:${sig.slice(0, 40)}`)) {
          result.alerts.push({ key: `dup:${sig.slice(0, 40)}`, text: `🕵️ Spam coordinado: el mismo mensaje lo han enviado ${users.size} cuentas en menos de 1 min.` });
        }
      }
    }
    return result;
  }

  /** Registra altas en un servidor. Devuelve si se considera raid. */
  recordJoins(serverId, count) {
    const now = this.now();
    const key = String(serverId);
    const list = (this.joins.get(key) || []).filter(at => now - at < JOIN_WINDOW_MS);
    for (let i = 0; i < count; i++) list.push(now);
    this.joins.set(key, list);
    const raid = list.length >= this.cfg.raidJoinLimit;
    return { raid, total: list.length };
  }

  sweep() {
    const now = this.now();
    for (const [domain, users] of this.linkUsers) {
      for (const [id, at] of users) if (now - at > LINK_WINDOW_MS) users.delete(id);
      if (!users.size) this.linkUsers.delete(domain);
    }
    for (const [key, users] of this.dupUsers) {
      for (const [id, at] of users) if (now - at > DUP_WINDOW_MS) users.delete(id);
      if (!users.size) this.dupUsers.delete(key);
    }
  }
}

module.exports = Suspicion;
