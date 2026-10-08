"use strict";

const pino = require("pino");

/** Logger JSON (apto para produccion). Redacta secretos aunque aparezcan por error. */
function createLogger(level = "info") {
  return pino({
    level,
    base: { app: "luxu" },
    redact: {
      paths: [
        "token",
        "*.token",
        "apiKey",
        "*.apiKey",
        "headers.authorization",
        "*.headers.authorization",
        "*.headers['x-api-key']"
      ],
      censor: "[REDACTED]"
    }
  });
}

module.exports = { createLogger };
