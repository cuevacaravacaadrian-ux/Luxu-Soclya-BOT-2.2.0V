"use strict";

const MEMBER_CAP = 200;
const MAX_SERVERS = 20;
const WELCOMES_PER_TICK = 3;

const text = value => (value == null ? "" : String(value));

/** Foto del servidor: nombre, descripción, salas y miembros (con bandera de bot si la API la trae). */
function snapshotOf(server, rooms, members) {
  const snap = {
    nombre: text(server.nombre),
    descripcion: text(server.descripcion),
    salas: {},
    miembros: {},
    parcial: members.length >= MEMBER_CAP,
    at: Date.now()
  };
  for (const room of rooms) {
    snap.salas[text(room.id)] = { nombre: text(room.nombre), tema: text(room.tema), tipo: text(room.tipo) };
  }
  for (const member of members) {
    snap.miembros[text(member.id)] = { username: text(member.username), bot: Boolean(member.bot) };
  }
  return snap;
}

/** Compara dos fotos y devuelve los cambios en lenguaje natural. Función pura: fácil de probar. */
function diffSnapshots(prev, next) {
  const out = [];
  if (prev.nombre !== next.nombre) {
    out.push({ kind: "servidor_renombrado", text: `El servidor se llama ahora «${next.nombre}» (antes «${prev.nombre}»).` });
  }
  if (prev.descripcion !== next.descripcion) {
    out.push({ kind: "descripcion_cambiada", text: "Se ha cambiado la descripción del servidor." });
  }
  for (const [id, room] of Object.entries(next.salas)) {
    const old = prev.salas[id];
    if (!old) {
      out.push({ kind: "sala_creada", text: `Nueva sala «${room.nombre}».` });
      continue;
    }
    if (old.nombre !== room.nombre) out.push({ kind: "sala_renombrada", text: `La sala «${old.nombre}» se llama ahora «${room.nombre}».` });
    if (old.tema !== room.tema) out.push({ kind: "tema_cambiado", text: `Ha cambiado el tema de «${room.nombre}».` });
    if (old.tipo !== room.tipo) out.push({ kind: "tipo_cambiado", text: `«${room.nombre}» cambió de tipo (${old.tipo} → ${room.tipo}).` });
  }
  for (const [id, room] of Object.entries(prev.salas)) {
    if (!next.salas[id]) out.push({ kind: "sala_eliminada", text: `Sala «${room.nombre}» eliminada.` });
  }
  if (!prev.parcial && !next.parcial) {
    for (const [id, member] of Object.entries(next.miembros)) {
      if (prev.miembros[id]) continue;
      if (member.bot) out.push({ kind: "bot_nuevo", text: `Se ha añadido el bot @${member.username}.`, human: false });
      else out.push({ kind: "miembro_nuevo", text: `Nuevo miembro: @${member.username}.`, human: true, username: member.username });
    }
    for (const [id, member] of Object.entries(prev.miembros)) {
      if (!next.miembros[id]) out.push({ kind: "miembro_salio", text: `@${member.username} ha salido del servidor.` });
    }
  }
  return out;
}

/**
 * Vigilancia periódica: cada intervalo fotografía los servidores donde está Luxu
 * y avisa de lo que cambia. Límites reales de la API: solo se ve lo que el bot puede leer,
 * no quién hizo el cambio, ni roles ni permisos.
 */
class ServerWatcher {
  constructor({ config, logger, store, api, outbox, suspicion, alert }) {
    this.config = config;
    this.logger = logger;
    this.store = store;
    this.api = api;
    this.outbox = outbox;
    this.suspicion = suspicion;
    this.alert = alert;
    this.running = false;
    this.lastTick = 0;
    this.lastError = null;
  }

  async tick(now = Date.now()) {
    if (this.running) return { skipped: true };
    this.running = true;
    const summary = { servers: 0, changes: 0, raids: 0, errors: 0 };
    try {
      const servers = (await this.api.listServers()).slice(0, MAX_SERVERS);
      const seen = new Set();
      for (const server of servers) {
        const id = text(server.id);
        if (!id) continue;
        seen.add(id);
        try {
          const result = await this.watchServer(server, now);
          summary.servers++;
          summary.changes += result.changes;
          summary.raids += result.raid ? 1 : 0;
        } catch (err) {
          summary.errors++;
          this.logger.warn({ err: err.message, servidor: id }, "vigilancia_servidor_fallida");
        }
      }
      for (const id of this.store.watchedIds()) {
        if (!seen.has(id)) {
          const old = this.store.getWatch(id);
          this.store.dropWatch(id);
          await this.alert(`⚠️ Luxu ya no aparece en el servidor «${old?.nombre || id}».`, { kind: "vigilancia" });
        }
      }
      this.lastTick = now;
      this.lastError = null;
      this.store.markDirty();
    } catch (err) {
      summary.errors++;
      this.lastError = err.message;
      this.logger.warn({ err: err.message }, "vigilancia_fallida");
    } finally {
      this.running = false;
    }
    return summary;
  }

  async watchServer(server, now) {
    const id = text(server.id);
    const [rooms, members] = await Promise.all([this.api.listRooms(id), this.api.listMembers(id)]);
    const next = snapshotOf(server, rooms, members);
    const prev = this.store.getWatch(id);
    this.store.setWatch(id, next);

    if (!prev) {
      this.logger.info({ servidor: next.nombre, salas: rooms.length, miembros: members.length }, "vigilancia_base_guardada");
      return { changes: 0, raid: false };
    }

    const changes = diffSnapshots(prev, next);
    let raid = false;
    const humanJoins = changes.filter(c => c.human);

    for (const change of changes) {
      this.store.audit({ type: "vigilancia", serverId: id, kind: change.kind, text: change.text });
      if (change.kind === "miembro_nuevo" || change.kind === "miembro_salio") continue;
      await this.alert(`🗂️ Vigilancia · ${next.nombre}\n${change.text}`, { kind: change.kind });
    }

    if (humanJoins.length) {
      const result = this.suspicion.recordJoins(id, humanJoins.length, now);
      if (result.raid) {
        raid = true;
        await this.alert(`🚨 Posible raid en «${next.nombre}»: ${result.total} entradas en menos de 1 min. Revisa las altas.`, { kind: "raid" });
      }
      if (this.config.welcomeSalaId && !raid) {
        for (const join of humanJoins.slice(0, WELCOMES_PER_TICK)) {
          await this.outbox.run("bienvenida", () => this.api.sendMessage(
            this.config.welcomeSalaId,
            `👋 ¡Bienvenido/a, @${join.username}! Lee las normas con /normas.`
          ));
        }
      }
    }
    return { changes: changes.length, raid };
  }

  status(now = Date.now()) {
    const day = this.store.auditSince("vigilancia", now - 86_400_000);
    return {
      servidores: this.store.watchedIds().length,
      ultimaRevision: this.lastTick ? new Date(this.lastTick).toISOString() : "todavía no",
      cambiosUltimas24h: day.length,
      recientes: day.slice(-5).map(a => a.text),
      error: this.lastError
    };
  }
}

module.exports = { ServerWatcher, diffSnapshots, snapshotOf };
