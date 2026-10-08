"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const RateLimiter = require("../src/core/rateLimiter");
const TtlCache = require("../src/core/cache");
const CircuitBreaker = require("../src/core/circuitBreaker");
const { Outbox } = require("../src/core/outbox");
const { backoffMs } = require("../src/core/http");

const silent = { info() {}, warn() {}, error() {}, debug() {} };

test("rate limiter cuenta dentro de la ventana y olvida lo antiguo", () => {
  const rl = new RateLimiter(1000, 2);
  assert.equal(rl.hit("a", 0).limited, false);
  assert.equal(rl.hit("a", 100).limited, false);
  assert.equal(rl.hit("a", 200).limited, true, "tercer mensaje en 1s");
  assert.equal(rl.hit("a", 5000).limited, false, "la ventana ya paso");
});

test("rate limiter barre claves caducadas", () => {
  const rl = new RateLimiter(1000, 5);
  rl.hit("x", 0);
  rl.hit("y", 0);
  rl.sweep(5000);
  assert.equal(rl.size, 0);
});

test("cache caduca y respeta el maximo", () => {
  const cache = new TtlCache({ max: 2, ttlMs: 10_000 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined, "la mas antigua se expulsa");
  assert.equal(cache.get("c"), 3);
});

test("circuit breaker se abre tras fallos y se recupera", async () => {
  const breaker = new CircuitBreaker("svc", silent, { failureThreshold: 2, cooldownMs: 60 });
  const fail = async () => { throw new Error("boom"); };
  await assert.rejects(breaker.call(fail));
  await assert.rejects(breaker.call(fail));
  assert.equal(breaker.state, "open");
  await assert.rejects(breaker.call(async () => 1), err => err.code === "CIRCUIT_OPEN");
  await new Promise(r => setTimeout(r, 80));
  assert.equal(breaker.state, "half-open");
  assert.equal(await breaker.call(async () => "ok"), "ok");
  assert.equal(breaker.state, "closed");
});

test("outbox respeta el orden y nunca lanza hacia fuera", async () => {
  const outbox = new Outbox(silent, { minIntervalMs: 0 });
  const order = [];
  const results = await Promise.all([
    outbox.run("a", async () => { order.push("a"); return 1; }),
    outbox.run("b", async () => { throw new Error("falla"); }),
    outbox.run("c", async () => { order.push("c"); return 3; })
  ]);
  assert.deepEqual(order, ["a", "c"]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].value, 3);
});

test("outbox se puede cerrar y vaciar", async () => {
  const outbox = new Outbox(silent, { minIntervalMs: 0 });
  await outbox.run("a", async () => 1);
  outbox.close();
  const after = await outbox.run("b", async () => 2);
  assert.equal(after.ok, false);
  assert.equal(await outbox.drain(100), true);
});

test("backoff respeta Retry-After y crece con los intentos", () => {
  assert.equal(backoffMs(1, "2"), 2000);
  assert.ok(backoffMs(3) >= 2000 && backoffMs(3) < 2300);
  assert.ok(backoffMs(50) <= 30_250);
});
