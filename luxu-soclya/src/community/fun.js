"use strict";

const crypto = require("crypto");
const { BOLA } = require("./content");

const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function rollDice(sides = 6, rng = Math.random) {
  const faces = clampInt(sides, 2, 1000, 6);
  return { faces, value: 1 + Math.floor(rng() * faces) };
}

function flipCoin(rng = Math.random) {
  return rng() < 0.5 ? "Cara" : "Cruz";
}

function eightBall(rng = Math.random) {
  return pick(BOLA, rng);
}

const RPS = ["piedra", "papel", "tijera"];
const BEATS = { piedra: "tijera", papel: "piedra", tijera: "papel" };

function rps(player, rng = Math.random) {
  const choice = String(player || "").toLowerCase();
  if (!RPS.includes(choice)) throw new Error("jugada inválida");
  const bot = pick(RPS, rng);
  let outcome = "empate";
  if (bot !== choice) outcome = BEATS[choice] === bot ? "tu" : "luxu";
  return { player: choice, bot, outcome };
}

function rpsText(result) {
  const verdict = result.outcome === "empate" ? "Empate 🤝"
    : result.outcome === "tu" ? "¡Ganas tú! 🏆"
      : "Gana Luxu 🤖";
  return `Tú: **${result.player}** · Luxu: **${result.bot}**\n${verdict}`;
}

/** Porcentaje determinista: la misma pareja siempre da el mismo resultado. */
function ship(first, second) {
  const [a, b] = [first, second].map(s => String(s).trim().toLowerCase()).sort();
  const digest = crypto.createHash("sha256").update(`${a}|${b}`).digest();
  const percent = digest.readUInt16BE(0) % 101;
  let label = "¡Pareja perfecta! 💘";
  if (percent < 20) label = "Ni en sueños 💔";
  else if (percent < 40) label = "Amistad, quizá 🤝";
  else if (percent < 60) label = "Hay chispa ✨";
  else if (percent < 80) label = "Buena pareja 💞";
  return { percent, label };
}

/** Separa una lista "a, b, c" en elementos limpios. */
function splitList(text, { min = 2, max = 20, maxItemLength = 60 } = {}) {
  const items = String(text || "")
    .split(",")
    .map(item => item.trim().slice(0, maxItemLength))
    .filter(Boolean);
  if (items.length < min) return null;
  return items.slice(0, max);
}

module.exports = { pick, rollDice, flipCoin, eightBall, rps, rpsText, ship, splitList, RPS };
