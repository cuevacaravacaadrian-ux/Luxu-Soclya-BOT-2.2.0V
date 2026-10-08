"use strict";

/** Ventana deslizante por clave. Incluye barrido para no crecer sin limite. */
class RateLimiter {
  constructor(windowMs, max) {
    this.windowMs = windowMs;
    this.max = max;
    this.buckets = new Map();
  }

  hit(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    const bucket = (this.buckets.get(key) || []).filter(t => t > cutoff);
    bucket.push(now);
    this.buckets.set(key, bucket);
    return { count: bucket.length, limited: bucket.length > this.max };
  }

  sweep(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, bucket] of this.buckets) {
      const fresh = bucket.filter(t => t > cutoff);
      if (fresh.length) this.buckets.set(key, fresh);
      else this.buckets.delete(key);
    }
  }

  get size() {
    return this.buckets.size;
  }
}

module.exports = RateLimiter;
