"use strict";

const WebSocket = require("ws");

const MAX_FRAME_BYTES = 1_000_000;
const BACKOFF_MIN_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const DEFAULT_HEARTBEAT_MS = 30_000;

/**
 * Cliente del gateway de Soclya (https://soclya.com/developer/docs/gateway).
 * - Descubre la URL con GET /gateway (no hay que configurarla).
 * - Latido + watchdog: si no llega latido_ok a tiempo, reconecta.
 * - Reconexion con espera creciente: 1s, 2s, 4s... hasta 60s (con un poco de jitter).
 */
class Gateway {
  constructor({ config, logger, api, onEvent, onHello }) {
    this.config = config;
    this.logger = logger;
    this.api = api;
    this.opts = { onEvent, onHello };

    this.ws = null;
    this.bot = null;
    this.ready = false;
    this.stopped = true;
    this.connecting = false;
    this.delay = BACKOFF_MIN_MS;
    this.heartbeatMs = DEFAULT_HEARTBEAT_MS;
    this.lastAck = 0;
    this.heartbeatTimer = null;
    this.watchdogTimer = null;
    this.reconnectTimer = null;
    this.reconnects = 0;
  }

  get connected() {
    return this.ready && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  async connect() {
    if (this.stopped || this.connecting || this.ws) return;
    this.connecting = true;

    let info;
    try {
      info = await this.api.gateway();
    } catch (err) {
      this.connecting = false;
      this.logger.error({ err: err.message, status: err.status }, "gateway_descubrimiento_fallido");
      this.scheduleReconnect();
      return;
    }
    this.connecting = false;
    if (this.stopped) return;

    if (!info?.url) {
      this.logger.error("gateway_sin_url");
      this.scheduleReconnect();
      return;
    }
    this.heartbeatMs = Number(info.latido_ms) || DEFAULT_HEARTBEAT_MS;

    const ws = new WebSocket(info.url, {
      headers: { Authorization: `Bot ${this.config.token}` },
      handshakeTimeout: 10_000,
      maxPayload: MAX_FRAME_BYTES
    });
    this.ws = ws;

    ws.on("open", () => this.logger.info("gateway_abierto"));
    ws.on("message", raw => this.onRaw(raw));
    ws.on("error", err => this.logger.warn({ err: err.message }, "gateway_error"));
    ws.on("close", (code, reason) => {
      if (this.ws === ws) this.ws = null;
      this.ready = false;
      this.stopTimers();
      this.logger.warn({ code, reason: String(reason || "") }, "gateway_cerrado");
      this.scheduleReconnect();
    });
  }

  onRaw(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      this.logger.warn("gateway_json_invalido");
      return;
    }

    switch (msg?.op) {
      case "hola":
        this.onHandshake(msg);
        break;
      case "latido_ok":
        this.lastAck = Date.now();
        break;
      case "evento":
        this.dispatch(msg);
        break;
      default:
        this.logger.debug({ op: msg?.op }, "gateway_op_no_manejada");
    }
  }

  onHandshake(msg) {
    this.ready = true;
    this.delay = BACKOFF_MIN_MS;
    this.bot = msg.bot ?? null;
    this.heartbeatMs = Number(msg.latido_ms) || this.heartbeatMs;
    this.lastAck = Date.now();
    this.startTimers();
    this.logger.info({
      bot: msg.bot?.username,
      servidores: Array.isArray(msg.servidores) ? msg.servidores.length : 0,
      latidoMs: this.heartbeatMs
    }, "gateway_listo");
    try {
      this.opts.onHello?.(msg);
    } catch (err) {
      this.logger.error({ err: err.message }, "gateway_onhello_fallido");
    }
  }

  dispatch(msg) {
    const event = {
      type: msg.evento,
      salaId: msg.sala_id != null ? String(msg.sala_id) : null,
      servidorId: msg.servidor_id != null ? String(msg.servidor_id) : null,
      data: msg.datos ?? {}
    };
    // No bloquea el socket: cada evento se procesa aparte y sus errores quedan registrados.
    Promise.resolve()
      .then(() => this.opts.onEvent(event))
      .catch(err => this.logger.error({ err: err?.message, evento: event.type }, "gateway_evento_fallido"));
  }

  send(payload) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      this.logger.warn({ err: err.message }, "gateway_envio_fallido");
    }
  }

  startTimers() {
    this.stopTimers();
    this.heartbeatTimer = setInterval(() => this.send({ op: "latido" }), this.heartbeatMs);
    this.watchdogTimer = setInterval(() => {
      if (Date.now() - this.lastAck > this.heartbeatMs * 3) {
        this.logger.warn("gateway_sin_latido_reconectando");
        try { this.ws?.terminate(); } catch {}
      }
    }, Math.max(1000, Math.floor(this.heartbeatMs / 2)));
  }

  stopTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.heartbeatTimer = null;
    this.watchdogTimer = null;
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const wait = this.delay + Math.floor(Math.random() * 500);
    this.logger.info({ esperaMs: wait }, "gateway_reintentando");
    this.reconnects++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.delay = Math.min(this.delay * 2, BACKOFF_MAX_MS);
      this.connect();
    }, wait);
  }

  stop() {
    this.stopped = true;
    this.ready = false;
    this.stopTimers();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      try { this.ws.close(1000, "apagado"); } catch {}
      this.ws = null;
    }
  }
}

module.exports = { Gateway };
