"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig } = require("../src/config");
const Store = require("../src/core/store");
const Moderator = require("../src/security/moderator");
const RoomMemory = require("../src/core/memory");
const Suspicion = require("../src/security/suspicion");
const { Outbox } = require("../src/core/outbox");

const silent = { info() {}, warn() {}, error() {}, debug() {}, fatal() {} };

function setup(env = {}) {
  const config = loadConfig({
    SOCLYA_BOT_TOKEN: "t",
    LUXU_SOCLYA_MODERATION: "false",
    LUXU_OUTBOX_INTERVAL_MS: "0",
    LUXU_ADMIN_IDS: "ADMIN",
    LUXU_ALERT_SALA_ID: "ALERTAS",
    LUXU_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "luxu-mod-")),
    ...env
  });
  const store = new Store(config.dataDir, silent);
  const calls = [];
  const api = {
    deleteMessage: async (s, m) => calls.push(["delete", s, m]),
    moderateMember: async (s, u, o) => calls.push(["member", s, u, o.accion, o.minutos]),
    sendMessage: async (s, t) => calls.push(["send", s, t])
  };
  const memory = new RoomMemory();
  const suspicion = new Suspicion(config);
  const alert = async text => calls.push(["alert", text]);
  const moderator = new Moderator({ config, logger: silent, store, api, outbox: new Outbox(silent, { minIntervalMs: 0 }), memory, suspicion, alert });
  const evt = (id, userId, texto, extra = {}) => ({
    type: "MENSAJE_CREADO",
    salaId: "S",
    servidorId: "SV",
    data: { id, texto, autor: { id: userId, username: `user${userId}`, bot: false }, ...extra }
  });
  return { config, store, calls, moderator, evt, memory };
}

test("un bloqueado se modera aunque escriba algo limpio", async () => {
  const { store, calls, moderator, evt } = setup();
  store.setFlag("BAD", "blocked", true);
  const caso = await moderator.onMessage(evt("m1", "BAD", "hola a todos"));
  assert.ok(caso);
  assert.equal(caso.severity, "high");
  assert.ok(calls.some(c => c[0] === "delete" && c[2] === "m1"));
});

test("un admin por nombre de usuario no se modera", async () => {
  const { config, calls, moderator, evt } = setup({ LUXU_ADMIN_USERNAMES: "@adricc" });
  assert.equal(config.adminUsernames.has("adricc"), true);
  const caso = await moderator.onMessage({ ...evt("n1", "X9", "eres una mierda"), data: { id: "n1", texto: "eres una mierda", autor: { id: "X9", username: "AdriCC", bot: false } } });
  assert.equal(caso, null);
  assert.equal(calls.length, 0);
});

test("un usuario de confianza no se modera", async () => {
  const { store, calls, moderator, evt } = setup();
  store.setFlag("VIP", "trusted", true);
  assert.equal(await moderator.onMessage(evt("m2", "VIP", "eres una mierda y te voy a matar")), null);
  assert.equal(calls.length, 0);
});

test("los admins no se moderan, pero sus mensajes entran en la memoria de la sala", async () => {
  const { calls, moderator, evt, memory } = setup();
  assert.equal(await moderator.onMessage(evt("m3", "ADMIN", "GRATIS NITRO https://bit.ly/x")), null);
  assert.equal(calls.length, 0);
  assert.equal(memory.recent("S").length, 1);
});

test("palabrota en modo estricto: se borra y se avisa, sin sanción", async () => {
  const { calls, moderator, evt } = setup();
  const caso = await moderator.onMessage(evt("p1", "P1", "esto es una mierda"));
  assert.equal(caso.level, 1);
  assert.ok(calls.some(c => c[0] === "delete" && c[2] === "p1"));
  assert.ok(calls.some(c => c[0] === "send" && /Luxu retiró/.test(c[2])));
  assert.ok(!calls.some(c => c[0] === "member"));
});

test("la reincidencia escala: aviso, aviso reiterado, aislamiento y expulsión", async () => {
  const { calls, moderator, evt } = setup();
  const levels = [];
  for (let i = 0; i < 5; i++) {
    const c = await moderator.onMessage(evt(`r${i}`, "R1", `ya van ${i} mierdas distintas aquí ${i}`));
    levels.push(c.level);
  }
  assert.deepEqual(levels, [1, 2, 3, 4, 5]);
  assert.ok(calls.some(c => c[0] === "member" && c[3] === "aislar" && c[4] === 10), "nivel 3: aislar 10 min");
  assert.ok(calls.some(c => c[0] === "member" && c[3] === "aislar" && c[4] === 60), "nivel 4: aislar 60 min");
  assert.ok(calls.some(c => c[0] === "member" && c[3] === "expulsar"), "nivel 5: expulsar");
});

test("una amenaza se castiga con expulsión directa", async () => {
  const { calls, moderator, evt } = setup();
  await moderator.onMessage(evt("t1", "T1", "te voy a matar"));
  assert.ok(calls.some(c => c[0] === "member" && c[3] === "expulsar"));
});

test("las ediciones se revisan pero no cuentan para flood", async () => {
  const { moderator, evt } = setup({ LUXU_SPAM_MAX: "1" });
  for (let i = 0; i < 5; i++) await moderator.onMessage(evt(`e${i}`, "E1", "texto inofensivo ok"), { edited: true });
  assert.equal(moderator.spam.buckets.size, 0);
});

test("en modo simulación se registra todo pero no se toca nada (las alertas sí salen)", async () => {
  const { calls, moderator, evt } = setup({ LUXU_ACTIONS_ENABLED: "false" });
  const caso = await moderator.onMessage(evt("s1", "S1", "eres una mierda de verdad"));
  assert.ok(caso.actions.some(a => a.startsWith("(simulado)")));
  assert.ok(!calls.some(c => c[0] === "delete"));
});

test("mensajes limpios no generan casos ni escrituras", async () => {
  const { calls, moderator, evt, memory } = setup();
  for (let i = 0; i < 3; i++) assert.equal(await moderator.onMessage(evt(`ok${i}`, "C1", `mensaje normal número ${i}`)), null);
  assert.equal(calls.length, 0);
  assert.equal(memory.recent("S").length, 3, "los mensajes limpios sí se recuerdan");
});

test("el mensaje del propio bot se ignora", async () => {
  const { calls, moderator, evt } = setup();
  moderator.botId = "BOT";
  assert.equal(await moderator.onMessage(evt("b1", "BOT", "GRATIS NITRO https://bit.ly/x")), null);
  assert.equal(calls.length, 0);
});
