"use strict";

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "+": "t", "!": "i" };

function normalize(input) {
  return String(input ?? "")
    .normalize("NFKC")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Forma "esqueleto": sin tildes, sin leet, sin repetidos. "1d10t4" -> "idiota", "imbeciiil" -> "imbecil". */
function skeleton(word) {
  return stripAccents(String(word).toLowerCase())
    .replace(/[013457@$+!]/g, ch => LEET[ch])
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function links(text) {
  return normalize(text).match(/https?:\/\/[^\s]+|www\.[^\s]+/gi) || [];
}

function countMentions(text) {
  return (normalize(text).match(/@[\p{L}\p{N}_.-]+/gu) || []).length;
}

function capsRatio(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length < 12) return 0;
  const upper = text.match(/\p{Lu}/gu) || [];
  return upper.length / letters.length;
}

/** Clave estable para detectar repeticiones (ignora mayúsculas, signos y espacios). */
function dupKey(text) {
  return normalize(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 300);
}

module.exports = { normalize, stripAccents, skeleton, links, countMentions, capsRatio, dupKey };
