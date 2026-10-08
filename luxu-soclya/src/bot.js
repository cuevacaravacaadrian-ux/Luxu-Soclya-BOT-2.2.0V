"use strict";

const { createLogger } = require("./core/logger");
const Store = require("./core/store");
const { SoclyaApi } = require("./core/soclyaApi");
const { Outbox } = require("./core/outbox");
const { Gateway } = require("./core/gateway");
const RoomMemory = require("./core/memory");
const { createAlerter } = require("./core/alerts");
const Moderator = require("./security/moderator");
const Suspicion = require("./security/suspicion");
const { ServerWatcher } = require("./watch/watcher");
const Assistant = require("./community/ai");
const InteractionRouter = require("./community/commands");
const { COMMANDS } = require("./community/definitions");

const MAINTENANCE_MS = 60_000;
const FIRST_WATCH_MS = 5_000;

/**
 * Ensambla el bot. No arranca nada hasta llamar a start(); start y stop son idempotentes,
 * así que todo se puede probar entero contra un servidor simulado.
 */
function createBot(config, { logger = createLogger(config.logLevel) } = {}) {
  const startedAt = Date.now();
  const store = new Store(config.dataDir, logger);
  const api = new SoclyaApi(config, logger);
  const outbox = new Outbox(logger, { minIntervalMs: config.outboxIntervalMs });
  const memory = new RoomMemory({ perRoom: config.memoryMessagesPerRoom });
  const suspicion = new Suspicion(config);
  const alert = createAlerter({ config, logger, store, api, outbox });
  const moderator = new Moderator({ config, logger, store, api, outbox, memory, suspicion, alert });
  const ai = new Assistant(config, logger);
  const watcher = new ServerWatcher({ config, logger, store, api, outbox, suspicion, alert });

  const status = () => ({
    gateway: gateway.connected ? "conectado" : "desconectado",
    moderacionSoclya: config.moderationApi ? moderator.breaker.state : "desactivada",
    ia: ai.enabled ? "activa" : "desactivada",
    uptimeMs: Date.now() - startedAt
  });

  const router = new InteractionRouter({ config, logger, store, api, outbox, moderator, ai, memory, alert, watcher, status });

  async function dispatch(evt) {
    store.incMetric("events");
    try {
      if (evt.type === "MENSAJE_CREADO") await moderator.onMessage(evt);
      else if (evt.type === "MENSAJE_EDITADO") await moderator.onMessage(evt, { edited: true });
      else if (evt.type === "INTERACCION") await router.onInteraction(evt);
    } catch (err) {
      store.incMetric("errors");
      logger.error({ err: err?.stack || err?.message, evento: evt.type }, "evento_fallido");
    }
  }

  const gateway = new Gateway({
    config,
    logger,
    api,
    onEvent: dispatch,
    onHello: hello => {
      moderator.botId = String(hello.bot?.id ?? "") || null;
    }
  });

  let maintenance = null;
  let watchTimer = null;
  let started = false;

  async function registerCommands() {
    const result = await outbox.run("registrar_comandos", () => api.registerCommands(COMMANDS));
    if (result.ok) logger.info({ comandos: COMMANDS.length }, "comandos_registrados");
    else logger.warn({ err: result.error?.message, status: result.error?.status }, "comandos_no_registrados");
  }

  async function start() {
    if (started) return;
    started = true;

    const total = config.securityLevel + config.communityLevel;
    logger.info({
      seguridad: config.securityLevel,
      comunidad: config.communityLevel,
      sensibilidad: Number(config.sensitivity.toFixed(2)),
      palabrotas: config.profanityLevel,
      automod: config.automod,
      acciones: config.actionsEnabled,
      autoBan: config.autoBan,
      expulsarEn: config.kickAt,
      moderacionSoclya: config.moderationApi,
      vigilancia: config.watchEnabled,
      ia: ai.enabled
    }, "luxu_iniciando");
    if (total !== 100) logger.warn({ total }, "reparto_seguridad_comunidad_no_suma_100");
    if (!config.ai.apiKey) logger.info("ia_desactivada_sin_clave");

    if (config.registerCommands) registerCommands();

    maintenance = setInterval(() => {
      moderator.sweep();
      store.maintain();
      store.flush();
    }, MAINTENANCE_MS);
    maintenance.unref();

    if (config.watchEnabled) {
      const loop = () => watcher.tick().finally(() => {
        if (started) watchTimer = setTimeout(loop, config.watchIntervalMs);
      });
      watchTimer = setTimeout(loop, FIRST_WATCH_MS);
      watchTimer.unref();
    }

    gateway.start();
  }

  async function stop() {
    if (!started) return;
    started = false;
    logger.info("luxu_apagando");
    gateway.stop();
    if (maintenance) clearInterval(maintenance);
    if (watchTimer) clearTimeout(watchTimer);
    outbox.close();
    const drained = await outbox.drain(3000);
    if (!drained) logger.warn({ pendientes: outbox.size }, "outbox_sin_vaciar_al_apagar");
    store.flush();
    logger.info("luxu_apagado");
  }

  return { start, stop, status, store, memory, moderator, watcher, gateway, router, outbox, dispatch };
}

module.exports = { createBot };
