"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const RoomMemory = require("../src/core/memory");

test("guarda los últimos mensajes de cada sala y descarta los antiguos", () => {
  const m = new RoomMemory({ perRoom: 3 });
  for (let i = 0; i < 5; i++) m.remember("S", { id: `m${i}`, userId: "u", username: "ana", text: `mensaje ${i}` });
  assert.deepEqual(m.recent("S").map(x => x.id), ["m2", "m3", "m4"]);
  assert.equal(m.previousText("S"), "mensaje 4");
});

test("las salas están separadas", () => {
  const m = new RoomMemory();
  m.remember("A", { id: "1", userId: "u", username: "x", text: "hola a todos" });
  assert.equal(m.recent("B").length, 0);
});

test("el resumen cuenta participantes y temas frecuentes", () => {
  const m = new RoomMemory();
  const texts = [
    ["ana", "hablemos del concierto de mañana"],
    ["luis", "el concierto empieza tarde"],
    ["ana", "sí, el concierto es en el parque"]
  ];
  texts.forEach(([username, text], i) => m.remember("S", { id: `m${i}`, userId: username, username, text }));
  const s = m.summary("S");
  assert.equal(s.participants, 2);
  assert.equal(s.top[0].username, "ana");
  assert.ok(s.keywords.includes("concierto"));
});

test("la memoria se limpia por antigüedad", () => {
  const m = new RoomMemory();
  m.remember("S", { id: "1", userId: "u", username: "x", text: "viejo", at: 0 });
  m.sweep(1000, 5000);
  assert.equal(m.rooms.size, 0);
});
