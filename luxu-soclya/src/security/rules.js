"use strict";

const { normalize, links, countMentions, capsRatio, dupKey } = require("./text");
const profanity = require("./profanity");

const SCAM = [
  { re: /\b(gratis|free|regalo)\s+(robux|nitro|v-?bucks|skins?|dinero|saldo|giftcards?|tarjeta regalo)\b/i, label: "oferta de regalos falsa" },
  { re: /\breclama\s+(ahora|tu premio|tu recompensa)\b|\bclaim\s+(your|now)\b/i, label: "reclamación de premio falsa" },
  { re: /\bverifica\s+(tu|su)\s+cuenta\b|\bverify\s+your\s+account\b/i, label: "verificación de cuenta falsa" },
  { re: /\b(introduce|pon|escribe|env[ií](a|ame)|mand[aá](me)?|p[aá]same)\s+(tu\s+|tus\s+)?(contrase[nñ]a|password|clave|c[oó]digo|token)s?\b/i, label: "robo de credenciales" },
  { re: /\b(airdrop|giveaway|sorteo)\b.*\b(seed|frase de recuperaci[oó]n|wallet|billetera)\b/i, label: "estafa de criptomonedas" },
  { re: /\b(ganaste|has ganado)\b.*\b(haz clic|click|entra en|pulsa)\b/i, label: "premio falso con enlace" }
];

const THREATS = [
  { re: /\b(te|os|les|le)\s+voy\s+a\s+(matar|reventar|pegar|rajar|apu[nñ]alar|buscar|encontrar|hacer\s+da[nñ]o)\b/i, code: "threat", label: "amenaza de violencia", points: 60 },
  { re: /\b(vamos|voy)\s+a\s+(matarte|pegarte|reventarte|matarlos|pegarles)\b/i, code: "threat", label: "amenaza de violencia", points: 60 },
  { re: /\b(matate|suicidate|suicidense|matense|ahorcate)\b/i, code: "self_harm", label: "incitación a hacerse daño", points: 60 },
  { re: /\b(ddos|dos attack|botnet|keylogger|ransomware)\b/i, code: "cyber", label: "tema de ciberataque", points: 30 },
  { re: /\b(doxx?(ear|ing|eo|ed)?|publicar\s+(su|tu|la)?\s*(direcci[oó]n|dni|tel[eé]fono|domicilio))\b/i, code: "doxxing", label: "doxxing o exposición de datos", points: 45 }
];

const SHORTENER = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.ly|cutt\.ly|is\.gd|rebrand\.ly|shorturl\.at)\b/i;

/**
 * Reglas locales: rápidas, sin red y siempre activas aunque la API de Soclya falle.
 * Devuelve puntos (0-100), señales con su código y su motivo legible.
 */
function analyzeText(input, cfg = {}) {
  const raw = String(input ?? "");
  const text = normalize(raw);
  const signals = [];
  const add = (code, label, points) => signals.push({ code, label, points });

  if (!text) return { points: 0, signals, normalized: text };

  if (text.length > (cfg.maxMessageLength ?? 1500)) add("long", "mensaje demasiado largo", 10);

  const profane = profanity.analyze(text, { level: cfg.profanityLevel ?? 3, custom: cfg.customWords || [] });
  if (profane.top) {
    add(profane.top === "slur" ? "slur" : "profanity", profanity.TIERS[profane.top].label, profane.points);
  }

  const scam = SCAM.find(rule => rule.re.test(text));
  if (scam) add("scam", scam.label, 40);

  const threat = THREATS.find(rule => rule.re.test(text));
  if (threat) add(threat.code, threat.label, threat.points);

  const urls = links(text);
  if (urls.length && SHORTENER.test(text)) add("shortener", "enlace acortado sospechoso", 20);
  if (urls.length >= (cfg.linkLimit ?? 4)) add("links", "exceso de enlaces", 18);

  if (countMentions(text) >= (cfg.massMentionLimit ?? 5)) add("mentions", "menciones masivas", 25);
  if (capsRatio(text) >= (cfg.capsRatio ?? 0.8)) add("caps", "mayúsculas excesivas", 8);
  if (/(.)\1{9,}/u.test(text)) add("repeat", "caracteres repetidos", 8);
  if ((text.match(/\p{Extended_Pictographic}/gu) || []).length >= 15) add("emoji", "exceso de emojis", 10);
  if ((text.match(/\p{M}/gu) || []).length >= 12) add("zalgo", "texto distorsionado", 12);

  const points = Math.min(100, signals.reduce((sum, s) => sum + s.points, 0));
  return { points, signals, normalized: text };
}

module.exports = { analyzeText, normalize, dupKey, links };
