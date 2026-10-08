"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Store = require("../src/core/store");

const silent = { info() {}, warn() {}, error() {}, debug() {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "luxu-test-"));

test("guarda y recarga el estado", () => {
  const dir = tmp();
  const store = new Store(dir, silent);
  store.setFlag("u1", "trusted", true);
  store.addCase({ userId: "u1", severity: "low", score: 40, reasons: ["x"] });
  assert.equal(store.flush(), true);

  const again = new Store(dir, silent);
  assert.equal(again.getUser("u1").trusted, true);
  assert.equal(again.recentCases(1)[0].userId, "u1");
});

test("un estado corrupto se respalda, no se pierde en silencio", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "state.json"), "{ esto no es json");
  const store = new Store(dir, silent);
  assert.deepEqual(store.state.cases, []);
  const backups = fs.readdirSync(dir).filter(f => f.includes("corrupto"));
  assert.equal(backups.length, 1);
});

test("los casos y la auditoria estan acotados", () => {
  const store = new Store(tmp(), silent);
  for (let i = 0; i < 5005; i++) {
    store.addCase({ n: i });
    store.audit({ n: i });
  }
  assert.equal(store.state.cases.length, 5000);
  assert.equal(store.state.audit.length, 10000 > 5005 ? 5005 : 10000);
  assert.equal(store.state.cases.at(-1).n, 5004);
});

test("busqueda de casos por prefijo de id", () => {
  const store = new Store(tmp(), silent);
  const item = store.addCase({ score: 1 });
  assert.equal(store.findCase(item.id.slice(0, 8)).id, item.id);
  assert.equal(store.findCase("zzzz"), null);
});

test("las encuestas guardadas tienen limite", () => {
  const store = new Store(tmp(), silent);
  for (let i = 0; i < 501; i++) store.savePoll(`id${i}`, { n: i });
  assert.equal(store.getPoll("id0"), null, "la más antigua se descarta");
  assert.deepEqual(store.getPoll("id500"), { n: 500 });
});

test("palabras propias: añadir, repetir, quitar", () => {
  const store = new Store(tmp(), silent);
  assert.equal(store.addWord("Vaya", "strong"), true);
  assert.equal(store.addWord("vaya"), false, "sin duplicados");
  assert.deepEqual(store.listWords(), [{ word: "vaya", tier: "strong" }]);
  assert.equal(store.removeWord("VAYA"), true);
  assert.equal(store.listWords().length, 0);
});

test("avisos: suma solo los activos dentro de la ventana", () => {
  const store = new Store(tmp(), silent);
  store.addWarning("w1", 2, "c1");
  store.addWarning("w1", 1, "c2");
  assert.equal(store.activeWarnings("w1", 60_000), 3);
  store.getUser("w1").warnings[0].at = Date.now() - 120_000;
  assert.equal(store.activeWarnings("w1", 60_000), 1);
  store.clearWarnings("w1");
  assert.equal(store.activeWarnings("w1", 60_000), 0);
});

test("los avisos antiguos caen fuera al limpiar", () => {
  const store = new Store(tmp(), silent);
  store.addWarning("u9", 2, "c1");
  store.getUser("u9").warnings[0].at = Date.now() - 40 * 86_400_000;
  store.getUser("u9").lastSeen = 0;
  store.maintain();
  assert.equal(store.state.users["u9"], undefined, "usuario inactivo sin historial se elimina");
});
