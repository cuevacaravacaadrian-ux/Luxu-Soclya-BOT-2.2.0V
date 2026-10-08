"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fun = require("../src/community/fun");

test("dados siempre dentro de rango", () => {
  for (let i = 0; i < 200; i++) {
    const roll = fun.rollDice(20);
    assert.ok(roll.value >= 1 && roll.value <= 20);
  }
  assert.equal(fun.rollDice(1).faces, 2, "minimo 2 caras");
  assert.equal(fun.rollDice(999999).faces, 1000, "maximo 1000 caras");
});

test("piedra, papel y tijera resuelven bien", () => {
  assert.equal(fun.rps("piedra", () => 0.0).bot, "piedra");
  assert.equal(fun.rps("piedra", () => 0.0).outcome, "empate");
  assert.equal(fun.rps("tijera", () => 0.0).outcome, "luxu", "piedra (bot) vence a tijera");
  assert.equal(fun.rps("papel", () => 0.0).outcome, "tu", "papel vence a piedra");
  assert.equal(fun.rps("piedra", () => 0.99).bot, "tijera");
  assert.equal(fun.rps("piedra", () => 0.99).outcome, "tu");
  assert.throws(() => fun.rps("lagarto"));
});

test("ship es determinista y simetrico", () => {
  assert.deepEqual(fun.ship("Ana", "Luis"), fun.ship("luis", "ana"));
  const { percent } = fun.ship("a", "b");
  assert.ok(percent >= 0 && percent <= 100);
});

test("splitList limpia y valida listas", () => {
  assert.deepEqual(fun.splitList(" pizza, sushi ,  ,tacos"), ["pizza", "sushi", "tacos"]);
  assert.equal(fun.splitList("solo"), null);
  assert.equal(fun.splitList("a,b,c,d", { max: 2 }).length, 2);
});

test("moneda devuelve cara o cruz", () => {
  assert.equal(fun.flipCoin(() => 0.1), "Cara");
  assert.equal(fun.flipCoin(() => 0.9), "Cruz");
});
