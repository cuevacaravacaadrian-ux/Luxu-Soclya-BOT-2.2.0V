"use strict";

/**
 * Envía avisos a la sala de moderadores (LUXU_ALERT_SALA_ID). Siempre queda registro
 * en la auditoría, aunque no haya sala configurada. Admite un enfriamiento por clave.
 */
function createAlerter({ config, logger, store, api, outbox }) {
  return async function alert(text, { kind = "general" } = {}) {
    store.audit({ type: "alerta", kind, text: text.slice(0, 300) });
    logger.info({ kind }, "alerta_generada");
    if (!config.alertSalaId) return { ok: false, reason: "sin_sala_de_alertas" };
    const result = await outbox.run("alerta", () => api.sendMessage(config.alertSalaId, text));
    if (!result.ok) logger.warn({ err: result.error?.message }, "alerta_no_enviada");
    return result;
  };
}

module.exports = { createAlerter };
