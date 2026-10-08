"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig, ConfigError } = require("../src/config");

const base = { SOCLYA_BOT_TOKEN: "tok" };

test("exige el token del bot", () => {
  assert.throws(() => loadConfig({}), ConfigError);
});

test("valores por defecto sensatos", () => {
  const c = loadConfig(base);
  assert.equal(c.securityLevel, 70);
  assert.equal(c.communityLevel, 30);
  assert.equal(c.sensitivity, 1);
  assert.equal(c.autoBan, false, "el baneo automatico es opt-in");
  assert.equal(c.ai.model, "claude-haiku-5-5");
  assert.equal(c.apiBase, "https://soclya.com/api/v1");
});

test("la comunidad se ajusta al resto de la seguridad", () => {
  const c = loadConfig({ ...base, LUXU_SECURITY_LEVEL: "80" });
  assert.equal(c.communityLevel, 20);
  assert.ok(c.sensitivity > 1);
});

test("rechaza booleanos y numeros invalidos con mensaje claro", () => {
  assert.throws(() => loadConfig({ ...base, LUXU_AUTOMOD_ENABLED: "quizas" }), /debe ser true o false/);
  assert.throws(() => loadConfig({ ...base, LUXU_RATE_LIMIT_MAX: "mucho" }), /debe ser un número/);
});

test("acepta https o localhost y rechaza http publico", () => {
  assert.throws(() => loadConfig({ ...base, SOCLYA_API_BASE: "http://soclya.com/api/v1" }), /https/);
  assert.doesNotThrow(() => loadConfig({ ...base, SOCLYA_API_BASE: "http://127.0.0.1:9999/api/v1" }));
});

test("la clave de IA admite el nombre estandar de Anthropic", () => {
  assert.equal(loadConfig({ ...base, ANTHROPIC_API_KEY: "k" }).ai.apiKey, "k");
  assert.equal(loadConfig({ ...base, LUXU_AI_API_KEY: "a", ANTHROPIC_API_KEY: "b" }).ai.apiKey, "a");
});
