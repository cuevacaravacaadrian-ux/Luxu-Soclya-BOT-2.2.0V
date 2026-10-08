"use strict";

const { request } = require("./http");

const MAX_TEXT = 2000;
const enc = value => encodeURIComponent(String(value));
const clip = (value, max) => String(value ?? "").slice(0, max);

class SoclyaError extends Error {
  constructor(message, { status = 0, codigo = null } = {}) {
    super(message);
    this.name = "SoclyaError";
    this.status = status;
    this.codigo = codigo;
  }
}

/** Cliente de la API REST de Soclya (https://soclya.com/developer/docs/api). */
class SoclyaApi {
  constructor(config, logger) {
    this.base = config.apiBase;
    this.token = config.token;
    this.logger = logger;
  }

  async call(method, path, { body, query, retries = 0, idempotent, timeoutMs } = {}) {
    const url = new URL(this.base + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    }

    const res = await request(url.toString(), {
      method,
      headers: { Authorization: `Bot ${this.token}` },
      body,
      retries,
      idempotent,
      timeoutMs: timeoutMs ?? 12_000
    });

    if (res.status === 204) return null;
    const envelope = res.json;
    if (!res.ok || !envelope || envelope.ok === false) {
      throw new SoclyaError(envelope?.error || `Soclya respondió ${res.status}`, {
        status: res.status,
        codigo: envelope?.codigo ?? null
      });
    }
    return envelope.data;
  }

  gateway() { return this.call("GET", "/gateway", { retries: 2 }); }
  me() { return this.call("GET", "/yo", { retries: 2 }); }

  sendMessage(salaId, texto) {
    return this.call("POST", `/salas/${enc(salaId)}/mensajes`, { body: { texto: clip(texto, MAX_TEXT) } });
  }

  deleteMessage(salaId, mensajeId) {
    return this.call("DELETE", `/salas/${enc(salaId)}/mensajes/${enc(mensajeId)}`, { retries: 1 });
  }

  respondInteraction(interactionId, payload) {
    return this.call("POST", `/interacciones/${enc(interactionId)}/responder`, { body: payload });
  }

  moderateText(texto, contexto) {
    const body = { texto: clip(texto, MAX_TEXT) };
    if (contexto) body.contexto = clip(contexto, 500);
    return this.call("POST", "/moderacion/texto", { body, retries: 1, idempotent: true });
  }

  async listServers() {
    const data = await this.call("GET", "/servidores", { retries: 2 });
    return Array.isArray(data) ? data : [];
  }

  async listRooms(servidorId) {
    const data = await this.call("GET", `/servidores/${enc(servidorId)}/salas`, { retries: 2 });
    return Array.isArray(data) ? data : [];
  }

  /** Lista de miembros (la API devuelve hasta 200). */
  async listMembers(servidorId) {
    const data = await this.call("GET", `/servidores/${enc(servidorId)}/miembros`, { retries: 2 });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  }

  moderateMember(servidorId, userId, { accion, minutos, motivo }) {
    const body = { accion };
    if (accion === "aislar") body.minutos = minutos;
    if (motivo) body.motivo = clip(motivo, 200);
    return this.call("POST", `/servidores/${enc(servidorId)}/miembros/${enc(userId)}`, { body });
  }

  async searchMembers(servidorId, query) {
    const data = await this.call("GET", `/servidores/${enc(servidorId)}/miembros`, {
      query: { q: clip(query, 64) },
      retries: 1
    });
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  }

  registerCommands(comandos) {
    return this.call("PUT", "/comandos", { body: { comandos }, retries: 1 });
  }
}

module.exports = { SoclyaApi, SoclyaError };
