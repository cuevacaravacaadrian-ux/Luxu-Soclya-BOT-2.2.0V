"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Suspicion = require("../src/security/suspicion");

let clock = 0;
const make = (extra = {}) => new Suspicion({ linkCampaignUsers: 3, coordinatedUsers: 4, raidJoinLimit: 8, ...extra }, { now: () => clock });

test("una campaña de enlaces se detecta cuando varias cuentas comparten el mismo dominio", () => {
  const s = make();
  clock = 0;
  s.observe({ salaId: "S", userId: "1", text: "mira https://oferta-falsa.xyz/a" });
  s.observe({ salaId: "S", userId: "2", text: "mira https://oferta-falsa.xyz/b" });
  const third = s.observe({ salaId: "S", userId: "3", text: "mira https://oferta-falsa.xyz/c" });
  assert.ok(third.codes.includes("link_campaign"));
  assert.ok(third.points >= 25);
  assert.equal(third.alerts.length, 1);
});

test("los dominios de confianza no cuentan", () => {
  const s = make();
  ["1", "2", "3", "4"].forEach(id => {
    assert.deepEqual(s.observe({ salaId: "S", userId: id, text: `mira este vídeo https://youtube.com/watch?v=${id}` }).codes, []);
  });
});

test("el spam coordinado se detecta con el mismo texto de varias cuentas", () => {
  const s = make();
  clock = 1000;
  let last;
  for (const id of ["a", "b", "c", "d"]) last = s.observe({ salaId: "S", userId: id, text: "Compra ya en mi tienda online" });
  assert.ok(last.codes.includes("coordinated_spam"));
});

test("las alertas repetidas se enfrían para no inundar a los moderadores", () => {
  const s = make();
  clock = 2000;
  for (const id of ["1", "2", "3"]) s.observe({ salaId: "S", userId: id, text: "https://campana.io/x" });
  const again = s.observe({ salaId: "S", userId: "4", text: "https://campana.io/y" });
  assert.equal(again.alerts.length, 0, "ya se avisó hace poco");
});

test("un raid se detecta al entrar muchos miembros en un minuto", () => {
  const s = make({ raidJoinLimit: 4 });
  clock = 5000;
  assert.equal(s.recordJoins("SV", 2).raid, false);
  assert.equal(s.recordJoins("SV", 2).raid, true);
  clock = 5000 + 61_000;
  assert.equal(s.recordJoins("SV", 1).raid, false, "la ventana ya pasó");
});

test("los mensajes editados no alimentan las campañas", () => {
  const s = make();
  const r = s.observe({ salaId: "S", userId: "1", text: "https://x.io/a", edited: true });
  assert.deepEqual(r.codes, []);
});
