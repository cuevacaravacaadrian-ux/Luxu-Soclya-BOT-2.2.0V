"use strict";

/**
 * Circuit breaker: tras N fallos seguidos deja de llamar al servicio durante
 * un periodo de enfriamiento, para no encadenar esperas ni saturarlo.
 * Estados: closed (normal) -> open (corta) -> half-open (prueba una llamada).
 */
class CircuitBreaker {
  constructor(name, logger, { failureThreshold = 4, cooldownMs = 30_000 } = {}) {
    this.name = name;
    this.logger = logger;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.failures = 0;
    this.openUntil = 0;
  }

  get state() {
    if (this.failures < this.failureThreshold) return "closed";
    return Date.now() < this.openUntil ? "open" : "half-open";
  }

  async call(task) {
    if (this.state === "open") {
      const error = new Error(`${this.name}: servicio en pausa tras varios fallos`);
      error.code = "CIRCUIT_OPEN";
      throw error;
    }
    try {
      const value = await task();
      if (this.failures >= this.failureThreshold) this.logger.info({ servicio: this.name }, "circuito_recuperado");
      this.failures = 0;
      return value;
    } catch (err) {
      this.failures++;
      if (this.failures >= this.failureThreshold) {
        this.openUntil = Date.now() + this.cooldownMs;
        this.logger.warn({ servicio: this.name, cooldownMs: this.cooldownMs }, "circuito_abierto");
      }
      throw err;
    }
  }
}

module.exports = CircuitBreaker;
