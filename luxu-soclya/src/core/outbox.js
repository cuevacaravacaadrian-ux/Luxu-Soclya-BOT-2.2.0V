"use strict";

const { sleep } = require("./http");

/**
 * Cola de salida: todas las escrituras a Soclya pasan por aqui.
 * Ventajas: respeta un ritmo maximo, no satura la API, y nunca lanza
 * excepciones hacia el resto del bot (siempre devuelve {ok, value|error}).
 */
class Outbox {
  constructor(logger, { minIntervalMs = 350, maxQueue = 500 } = {}) {
    this.logger = logger;
    this.minIntervalMs = minIntervalMs;
    this.maxQueue = maxQueue;
    this.queue = [];
    this.running = false;
    this.closed = false;
    this.last = 0;
  }

  run(label, task, { critical = false } = {}) {
    return new Promise(resolve => {
      if (this.closed) {
        resolve({ ok: false, error: new Error("La cola de salida está cerrada") });
        return;
      }
      if (this.queue.length >= this.maxQueue) {
        const index = this.queue.findIndex(job => !job.critical);
        if (index === -1) {
          resolve({ ok: false, error: new Error("Cola de salida llena") });
          return;
        }
        const [dropped] = this.queue.splice(index, 1);
        this.logger.warn({ label: dropped.label }, "outbox_descartado_por_carga");
        dropped.resolve({ ok: false, error: new Error("Descartado: cola llena") });
      }
      this.queue.push({ label, task, critical, resolve });
      this.pump();
    });
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        const wait = this.last + this.minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        this.last = Date.now();
        try {
          job.resolve({ ok: true, value: await job.task() });
        } catch (error) {
          job.resolve({ ok: false, error });
        }
      }
    } finally {
      this.running = false;
    }
  }

  close() {
    this.closed = true;
  }

  /** Espera a que la cola se vacie (o hasta timeoutMs). Para apagado ordenado. */
  async drain(timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length || this.running) && Date.now() < deadline) {
      await sleep(25);
    }
    return this.queue.length === 0 && !this.running;
  }

  get size() {
    return this.queue.length;
  }
}

module.exports = { Outbox };
