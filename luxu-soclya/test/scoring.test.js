"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { severityOf, warningWeight, apiPoints, activityPoints, combine } = require("../src/security/scoring");

test("umbrales de gravedad", () => {
  assert.equal(severityOf(0), "none");
  assert.equal(severityOf(34), "low");
  assert.equal(severityOf(35), "medium");
  assert.equal(severityOf(60), "high");
  assert.equal(severityOf(85), "critical");
});

test("el peso de los avisos crece con la gravedad", () => {
  assert.equal(warningWeight("low"), 0);
  assert.equal(warningWeight("medium"), 1);
  assert.equal(warningWeight("high"), 2);
  assert.equal(warningWeight("critical"), 3);
});

test("la API de Soclya se traduce a puntos según acción, categoría y confianza", () => {
  assert.equal(apiPoints(null), 0);
  assert.equal(apiPoints({ accion: "permitir", confianza: 0.99 }), 0);
  assert.equal(apiPoints({ accion: "censurar", confianza: 0.65, categorias: ["harassment"] }), 25);
  assert.equal(apiPoints({ accion: "bloquear", confianza: 0.9, categorias: ["illegal_activity"] }), 67);
  assert.equal(apiPoints({ accion: "bloquear", confianza: 0.9, categorias: ["violence_threat"] }), 90);
});

test("el flood suma y se limita", () => {
  assert.equal(activityPoints({}), 0);
  assert.equal(activityPoints({ rate: true, spam: true, repeat: true }), 50);
});

test("los avisos activos no disparan nada por sí solos", () => {
  assert.equal(combine({ warnings: 10 }), 0);
  assert.ok(combine({ local: 10, warnings: 3 }) > 10);
});

test("la sensibilidad escala y se limita a 0-100", () => {
  assert.equal(combine({ local: 30, sensitivity: 1.5 }), 45);
  assert.equal(combine({ local: 90, api: 90, sensitivity: 1.5 }), 100);
});
