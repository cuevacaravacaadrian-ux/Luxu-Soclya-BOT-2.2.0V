"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyzeText, dupKey, links } = require("../src/security/rules");
const profanity = require("../src/security/profanity");
const { skeleton, countMentions } = require("../src/security/text");

const codes = (text, cfg = {}) => analyzeText(text, cfg).signals.map(s => s.code);

test("palabrotas: detecta por palabra completa", () => {
  assert.equal(profanity.analyze("eres un idiota").top, "strong");
  assert.equal(profanity.analyze("eres un IDIOTAS").top, "strong", "plural");
  assert.equal(profanity.analyze("eres un 1d10t4").top, "strong", "leet speak");
  assert.equal(profanity.analyze("iiidiotaaaa").top, "strong", "letras repetidas");
  assert.equal(profanity.analyze("i.d.i.o.t.a").top, "strong", "letras separadas");
});

test("palabrotas: no confunde palabras inocentes", () => {
  assert.equal(profanity.analyze("voy a comprar un computador nuevo").top, null);
  assert.equal(profanity.analyze("me encanta la computadora").top, null);
  assert.equal(profanity.analyze("buenos días a todos").top, null);
});

test("palabrotas: el nivel de severidad decide qué cuenta", () => {
  assert.equal(profanity.analyze("qué mierda", { level: 1 }).top, "strong");
  assert.equal(profanity.analyze("ostias, qué frío", { level: 1 }).top, null, "suave solo cuenta en nivel 3");
  assert.equal(profanity.analyze("ostias, qué frío", { level: 3 }).top, "mild", "modo estricto");
  assert.equal(profanity.analyze("eso es tonto", { level: 1 }).top, null);
  assert.equal(profanity.analyze("eso es tonto", { level: 2 }).top, "medium");
});

test("palabrotas: la discriminación siempre cuenta como lo más grave", () => {
  const r = profanity.analyze("eres un puta", { level: 1 });
  assert.equal(r.top, "slur");
  assert.ok(r.points >= 70);
});

test("palabrotas: las palabras propias se suman a la lista", () => {
  assert.equal(profanity.analyze("eso es vaya cosa").top, null);
  assert.equal(profanity.analyze("eso es vaya cosa", { custom: [{ word: "vaya", tier: "strong" }] }).top, "strong");
});

test("reglas: las señales llevan código y motivo", () => {
  assert.ok(codes("eres una mierda").includes("profanity"));
  assert.ok(codes("eres un puta").includes("slur"));
  assert.ok(codes("GRATIS NITRO aquí").includes("scam"));
  assert.ok(codes("verifica tu cuenta ahora").includes("scam"));
  assert.ok(codes("envíame tu contraseña para el premio").includes("scam"));
  assert.equal(codes("hola, ¿qué tal el partido de ayer?").length, 0);
});

test("reglas: amenazas, incitación y ciberataques", () => {
  assert.ok(codes("te voy a matar").includes("threat"));
  assert.ok(codes("matate ya").includes("self_harm"));
  assert.ok(codes("lanzamos un ddos contra ellos").includes("cyber"));
});

test("reglas: enlaces, menciones y acortadores", () => {
  assert.equal(countMentions("@a @b @c @d @e @f"), 6);
  assert.equal(links("mira https://a.com y https://b.com").length, 2);
  assert.ok(codes("entra en https://bit.ly/xyz").includes("shortener"));
});

test("reglas: mayúsculas y texto distorsionado", () => {
  assert.ok(codes("ESTO ES MUY GRITÓN Y PESADO DE LEER").includes("caps"));
  assert.ok(codes("h" + "\u0334".repeat(14) + "ola").includes("zalgo"));
});

test("reglas: la puntuación nunca pasa de 100", () => {
  const text = "GRATIS NITRO te voy a matar puta mierda https://bit.ly/a https://b.co https://c.co https://d.co @a @b @c @d @e @f ddos";
  assert.ok(analyzeText(text).points <= 100);
});

test("utilidades: dupKey ignora mayúsculas y signos; skeleton normaliza", () => {
  assert.equal(dupKey("¡Hola, mundo!"), dupKey("hola mundo"));
  assert.equal(skeleton("Imbécil"), skeleton("imbecil"));
  assert.equal(skeleton("1d10t4"), "idiota");
});
