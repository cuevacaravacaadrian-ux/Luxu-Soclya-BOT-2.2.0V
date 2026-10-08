#!/usr/bin/env node
"use strict";

require("dotenv").config();

const { loadConfig, ConfigError } = require("./config");
const { createLogger } = require("./core/logger");
const { createBot } = require("./bot");

let config;
try {
  config = loadConfig();
} catch (err) {
  const message = err instanceof ConfigError ? err.message : `Error de configuración: ${err.message}`;
  console.error(`❌ ${message}`);
  console.error("   Revisa tu fichero .env (plantilla: .env.example).");
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const bot = createBot(config, { logger });

let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, "luxu_cierre");
  const timer = setTimeout(() => process.exit(1), 5000);
  timer.unref();
  try {
    await bot.stop();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", reason => {
  logger.error({ err: reason?.stack || reason }, "promesa_no_controlada");
});
process.on("uncaughtException", err => {
  logger.fatal({ err: err?.stack || err }, "excepcion_no_controlada");
  bot.stop().finally(() => process.exit(1));
});

bot.start().catch(err => {
  logger.fatal({ err: err?.stack || err }, "arranque_fallido");
  process.exit(1);
});
