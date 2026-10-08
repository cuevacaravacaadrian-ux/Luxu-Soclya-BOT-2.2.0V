"use strict";

const { skeleton, stripAccents } = require("./text");

/**
 * Palabrotas e insultos por niveles de severidad.
 * level 1: solo insultos fuertes y discriminación.
 * level 2: + palabrotas medias.
 * level 3: todo, incluidas las palabrotas suaves (modo estricto, por defecto).
 */
const TIERS = {
  mild: { minLevel: 3, points: 36, label: "palabrota" },
  medium: { minLevel: 2, points: 40, label: "palabrota o insulto" },
  strong: { minLevel: 1, points: 50, label: "insulto fuerte" },
  slur: { minLevel: 1, points: 70, label: "lenguaje discriminatorio" }
};

const WORDS = {
  slur: [
    "puta", "puto", "zorra", "maricon", "marica", "mongolo", "sudaca", "negrata", "paki",
    "hijoputa", "hijueputa", "hdp", "hpta", "perra", "subnormal", "retrasado",
    "fuck", "motherfucker", "bitch", "nigger", "nigga", "faggot", "retard", "cunt"
  ],
  strong: [
    "idiota", "imbecil", "estupido", "gilipollas", "cabron", "mierda", "joder", "hostia", "hostias",
    "carajo", "cojones", "capullo", "cretino", "malparido", "guevon", "huevon", "pinche", "chingar",
    "chingada", "verga", "tarado", "mamon", "pendejo", "pendeja", "lameculos", "ptm", "mamahuevo",
    "shit", "fucking", "asshole", "dick"
  ],
  medium: [
    "tonto", "tonta", "inutil", "payaso", "bobo", "asqueroso", "basura", "cerdo", "estupida", "zopenco"
  ],
  mild: [
    "maldito", "maldita", "ostias", "culo", "jolin", "joder", "caray", "diablos", "rayos"
  ]
};

const ORDER = ["mild", "medium", "strong", "slur"];

function forms(word) {
  const s = skeleton(word);
  return [s, `${s}s`, `${s}es`, `${s}a`, `${s}as`, `${s}o`, `${s}os`];
}

const cache = new Map();

/** Tabla forma -> nivel. Memorizada: las palabras propias cambian poco. */
function lookupFor(custom = []) {
  const key = custom.map(c => `${c.word}:${c.tier}`).join("|");
  if (cache.has(key)) return cache.get(key);

  const map = new Map();
  for (const tier of ORDER) {
    for (const word of WORDS[tier]) for (const form of forms(word)) map.set(form, tier);
  }
  for (const item of custom) {
    const tier = TIERS[item.tier] ? item.tier : "medium";
    for (const form of forms(item.word)) map.set(form, tier);
  }
  if (cache.size > 20) cache.clear();
  cache.set(key, map);
  return map;
}

/**
 * Busca palabrotas por palabra completa (no por subcadena: "computador" no es "puta").
 * Cubre tildes, leet speak, letras repetidas y letras separadas ("i.d.i.o.t.a").
 */
function analyze(text, { level = 3, custom = [] } = {}) {
  const lookup = lookupFor(custom);
  const plain = stripAccents(String(text).toLowerCase());
  const hits = [];
  const check = form => {
    const tier = lookup.get(form);
    if (tier && TIERS[tier].minLevel <= level) hits.push(tier);
  };

  for (const word of plain.split(/[^a-z0-9@$!+]+/)) {
    if (word) check(skeleton(word));
  }
  for (const match of plain.matchAll(/(?<![a-z])(?:[a-z][^a-z0-9]{1,3}){3,}[a-z](?![a-z])/g)) {
    check(skeleton(match[0]));
  }

  if (!hits.length) return { points: 0, top: null, hits: [], count: 0 };
  const top = hits.reduce((best, tier) => (TIERS[tier].points > TIERS[best].points ? tier : best), hits[0]);
  const points = Math.min(90, TIERS[top].points + Math.min(15, 5 * (hits.length - 1)));
  return { points, top, hits: [...new Set(hits)], count: hits.length };
}

module.exports = { analyze, TIERS, lookupFor };
