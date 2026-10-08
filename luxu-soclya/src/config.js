"use strict";

const path = require("path");

const TRUE_VALUES = ["1", "true", "si", "sí", "yes", "on"];
const FALSE_VALUES = ["0", "false", "no", "off"];
const DEFAULT_RULES = [
  "Respeto ante todo: nada de insultos ni palabrotas",
  "Sin spam, estafas ni enlaces engañosos",
  "Sin amenazas, acoso ni contenido de odio",
  "Respeta a los moderadores; si algo no te parece justo, usa /reportar",
  "Usa cada sala para lo que está pensada"
];

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

function readText(env, name, fallback = "") {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = String(raw).trim();
  return value === "" ? fallback : value;
}

function readFlag(env, name, fallback) {
  const value = readText(env, name).toLowerCase();
  if (!value) return fallback;
  if (TRUE_VALUES.includes(value)) return true;
  if (FALSE_VALUES.includes(value)) return false;
  throw new ConfigError(`${name} debe ser true o false (valor actual: "${value}")`);
}

function readNumber(env, name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value = readText(env, name);
  if (!value) return fallback;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new ConfigError(`${name} debe ser un número (valor actual: "${value}")`);
  return Math.min(max, Math.max(min, parsed));
}

function readIds(env, name) {
  return new Set(readText(env, name).split(",").map(s => s.trim()).filter(Boolean));
}

function readRules(env) {
  const raw = readText(env, "LUXU_RULES");
  if (!raw) return DEFAULT_RULES;
  return raw.split("|").map(s => s.trim()).filter(Boolean).slice(0, 10);
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Lee y valida la configuración desde variables de entorno.
 * Lanza ConfigError con un mensaje claro si algo no cuadra.
 */
function loadConfig(env = process.env) {
  const token = readText(env, "SOCLYA_BOT_TOKEN");
  if (!token) throw new ConfigError("Falta SOCLYA_BOT_TOKEN en el fichero .env");

  const apiBase = readText(env, "SOCLYA_API_BASE", "https://soclya.com/api/v1").replace(/\/+$/, "");
  const secureOrLocal = /^https:\/\//.test(apiBase) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(apiBase);
  if (!secureOrLocal) throw new ConfigError("SOCLYA_API_BASE debe usar https");

  const securityLevel = readNumber(env, "LUXU_SECURITY_LEVEL", 70, { min: 0, max: 100 });
  const communityLevel = readNumber(env, "LUXU_COMMUNITY_LEVEL", 100 - securityLevel, { min: 0, max: 100 });

  const kickAt = readNumber(env, "LUXU_KICK_AT", 5, { min: 4, max: 50 });
  const banAt = Math.max(kickAt + 1, readNumber(env, "LUXU_BAN_AT", 7, { min: 5, max: 100 }));

  return {
    token,
    apiBase,
    ownerIds: readIds(env, "LUXU_OWNER_IDS"),
    adminIds: readIds(env, "LUXU_ADMIN_IDS"),
    // Admins por nombre de usuario (sin @). Práctico, pero el id es lo que se usa para decidir si hay dudas.
    adminUsernames: new Set([...readIds(env, "LUXU_ADMIN_USERNAMES")].map(n => n.replace(/^@/, "").toLowerCase())),
    alertSalaId: readText(env, "LUXU_ALERT_SALA_ID"),
    welcomeSalaId: readText(env, "LUXU_WELCOME_SALA_ID"),
    rules: readRules(env),

    securityLevel,
    communityLevel,
    // 70 = normal. Por encima, Luxu actúa antes; por debajo, es más permisivo.
    sensitivity: clamp(securityLevel / 70, 0.5, 1.5),

    automod: readFlag(env, "LUXU_AUTOMOD_ENABLED", true),
    moderationApi: readFlag(env, "LUXU_SOCLYA_MODERATION", true),
    actionsEnabled: readFlag(env, "LUXU_ACTIONS_ENABLED", true),
    autoBan: readFlag(env, "LUXU_AUTO_BAN", false),
    timeoutMinutes: readNumber(env, "LUXU_TIMEOUT_MINUTES", 10, { min: 1, max: 10080 }),
    warningDecayHours: readNumber(env, "LUXU_WARNING_DECAY_HOURS", 24, { min: 1, max: 720 }),
    kickAt,
    banAt,

    // Palabrotas: 1 = solo insultos fuertes y discriminación; 2 = + medias; 3 = todas (estricto).
    profanityLevel: readNumber(env, "LUXU_PROFANITY_LEVEL", 3, { min: 1, max: 3 }),

    maxMessageLength: readNumber(env, "LUXU_MAX_MESSAGE_LENGTH", 1500, { min: 50, max: 2000 }),
    rateLimitWindowMs: readNumber(env, "LUXU_RATE_LIMIT_WINDOW_MS", 10000, { min: 1000 }),
    rateLimitMax: readNumber(env, "LUXU_RATE_LIMIT_MAX", 12, { min: 1 }),
    spamWindowMs: readNumber(env, "LUXU_SPAM_WINDOW_MS", 8000, { min: 1000 }),
    spamMax: readNumber(env, "LUXU_SPAM_MAX", 6, { min: 1 }),
    duplicateWindowMs: readNumber(env, "LUXU_DUPLICATE_WINDOW_MS", 15000, { min: 1000 }),
    duplicateMax: readNumber(env, "LUXU_DUPLICATE_MAX", 3, { min: 2 }),
    massMentionLimit: readNumber(env, "LUXU_MASS_MENTION_LIMIT", 5, { min: 2 }),
    linkLimit: readNumber(env, "LUXU_LINK_LIMIT", 4, { min: 1 }),
    capsRatio: readNumber(env, "LUXU_CAPS_RATIO", 0.8, { min: 0.3, max: 1 }),

    watchEnabled: readFlag(env, "LUXU_WATCH_ENABLED", true),
    watchIntervalMs: readNumber(env, "LUXU_WATCH_INTERVAL_MS", 120000, { min: 30000 }),
    raidJoinLimit: readNumber(env, "LUXU_RAID_JOIN_LIMIT", 8, { min: 3 }),

    registerCommands: readFlag(env, "LUXU_REGISTER_COMMANDS", true),
    memoryMessagesPerRoom: readNumber(env, "LUXU_MEMORY_MESSAGES", 40, { min: 10, max: 200 }),

    ai: {
      enabled: readFlag(env, "LUXU_AI_ENABLED", true),
      apiKey: readText(env, "LUXU_AI_API_KEY") || readText(env, "ANTHROPIC_API_KEY"),
      model: readText(env, "LUXU_AI_MODEL", "claude-haiku-5-5"),
      maxTokens: readNumber(env, "LUXU_AI_MAX_TOKENS", 300, { min: 50, max: 1024 }),
      rateLimitMax: readNumber(env, "LUXU_AI_RATE_LIMIT_MAX", 5, { min: 1, max: 60 }),
      baseUrl: readText(env, "LUXU_AI_BASE_URL", "https://api.anthropic.com").replace(/\/+$/, "")
    },

    dataDir: path.resolve(readText(env, "LUXU_DATA_DIR", path.join(process.cwd(), "data"))),
    logLevel: readText(env, "LUXU_LOG_LEVEL", "info"),
    outboxIntervalMs: readNumber(env, "LUXU_OUTBOX_INTERVAL_MS", 350, { min: 0, max: 5000 })
  };
}

module.exports = { loadConfig, ConfigError, DEFAULT_RULES };
