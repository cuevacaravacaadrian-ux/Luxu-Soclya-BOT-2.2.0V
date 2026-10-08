"use strict";

const STOP = new Set([
  "para", "pero", "como", "esto", "esta", "estas", "estos", "porque", "cuando", "donde",
  "tengo", "tiene", "tienen", "hacer", "todos", "todas", "algo", "alguien", "bueno", "buena",
  "sobre", "desde", "hasta", "quien", "tambien", "también", "aunque", "entonces", "siempre",
  "nunca", "ahora", "solo", "sólo", "muy", "more", "that", "with", "this", "just", "están"
]);

/**
 * Memoria de corto plazo: los últimos mensajes de cada sala (solo en RAM).
 * Sirve para dar contexto a la moderación, resumir la conversación y detectar actividad.
 */
class RoomMemory {
  constructor({ perRoom = 40, maxRooms = 100, maxTextLength = 300 } = {}) {
    this.perRoom = perRoom;
    this.maxRooms = maxRooms;
    this.maxTextLength = maxTextLength;
    this.rooms = new Map();
  }

  remember(salaId, { id, userId, username, text, at = Date.now() }) {
    const key = String(salaId);
    let list = this.rooms.get(key);
    if (!list) {
      list = [];
      this.rooms.set(key, list);
      if (this.rooms.size > this.maxRooms) this.rooms.delete(this.rooms.keys().next().value);
    }
    list.push({ id, userId, username: username || "usuario", text: String(text).slice(0, this.maxTextLength), at });
    if (list.length > this.perRoom) list.splice(0, list.length - this.perRoom);
  }

  recent(salaId, n = 20) {
    return (this.rooms.get(String(salaId)) || []).slice(-n);
  }

  previousText(salaId) {
    const list = this.rooms.get(String(salaId)) || [];
    return list.length ? list[list.length - 1].text : null;
  }

  /** Resumen sin IA: participantes, quién habla más y palabras clave. */
  summary(salaId, n = 40) {
    const list = this.recent(salaId, n);
    const counts = new Map();
    const words = new Map();
    for (const m of list) {
      counts.set(m.username, (counts.get(m.username) || 0) + 1);
      for (const w of m.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-zñ]+/)) {
        if (w.length < 5 || STOP.has(w)) continue;
        words.set(w, (words.get(w) || 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([username, count]) => ({ username, count }));
    const keywords = [...words.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
    return { total: list.length, participants: counts.size, top, keywords };
  }

  lines(salaId, n = 40) {
    return this.recent(salaId, n).map(m => `@${m.username}: ${m.text}`);
  }

  sweep(maxAgeMs = 6 * 3_600_000, now = Date.now()) {
    for (const [key, list] of this.rooms) {
      const fresh = list.filter(m => now - m.at < maxAgeMs);
      if (fresh.length) this.rooms.set(key, fresh);
      else this.rooms.delete(key);
    }
  }
}

module.exports = RoomMemory;
