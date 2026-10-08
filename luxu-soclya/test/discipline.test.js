"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const discipline = require("../src/security/discipline");

const cfg = { timeoutMinutes: 10, kickAt: 5, banAt: 7, autoBan: false };
const types = p => p.actions.map(a => a.type);

test("nivel 1: solo aviso", () => {
  const p = discipline.plan({ total: 1, severity: "medium", cfg });
  assert.deepEqual(types(p), ["aviso"]);
  assert.equal(p.alert, false);
});

test("nivel 2: aviso reiterado", () => {
  const p = discipline.plan({ total: 2, severity: "medium", cfg });
  assert.deepEqual(types(p), ["aviso"]);
  assert.equal(p.actions[0].tone, "fuerte");
});

test("nivel 3: aislamiento de la duración configurada", () => {
  const p = discipline.plan({ total: 3, severity: "medium", cfg });
  assert.deepEqual(p.actions.find(a => a.type === "aislar"), { type: "aislar", minutos: 10 });
});

test("nivel 4: aislamiento de 60 minutos y alerta", () => {
  const p = discipline.plan({ total: 4, severity: "high", cfg });
  assert.deepEqual(p.actions.find(a => a.type === "aislar"), { type: "aislar", minutos: 60 });
  assert.equal(p.alert, true);
});

test("nivel K: expulsión", () => {
  const p = discipline.plan({ total: 5, severity: "medium", cfg });
  assert.ok(types(p).includes("expulsar"));
  assert.ok(!types(p).includes("banear"));
});

test("baneo solo si autoBan y se llega al nivel de baneo", () => {
  assert.ok(types(discipline.plan({ total: 7, severity: "medium", cfg: { ...cfg, autoBan: true } })).includes("banear"));
  assert.ok(!types(discipline.plan({ total: 7, severity: "medium", cfg })).includes("banear"));
});

test("critico salta a aislamiento de 60 minutos aunque sea el primer aviso", () => {
  const p = discipline.plan({ total: 3, severity: "critical", cfg });
  assert.deepEqual(p.actions.find(a => a.type === "aislar"), { type: "aislar", minutos: 60 });
});

test("amenazas y autolesiones expulsan directamente", () => {
  assert.ok(types(discipline.plan({ total: 1, severity: "medium", codes: ["threat"], cfg })).includes("expulsar"));
  assert.ok(types(discipline.plan({ total: 1, severity: "medium", codes: ["self_harm"], cfg })).includes("expulsar"));
});

test("sin avisos no hay plan", () => {
  assert.deepEqual(discipline.plan({ total: 0, severity: "low", cfg }).actions, []);
});

test("render: el aviso simple se omite si hay sanción, y los textos mencionan al usuario", () => {
  const p = discipline.plan({ total: 3, severity: "medium", cfg });
  const steps = discipline.render(p, { name: "pepe", motivo: "palabrota" });
  assert.ok(!steps.some(s => s.type === "aviso"));
  assert.ok(steps.every(s => s.text.includes("@pepe")));
  const first = discipline.render(discipline.plan({ total: 1, severity: "medium", cfg }), { name: "pepe", motivo: "palabrota" });
  assert.match(first[0].text, /Es un aviso/);
});
