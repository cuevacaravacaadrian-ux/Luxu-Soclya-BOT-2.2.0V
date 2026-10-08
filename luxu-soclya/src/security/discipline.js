"use strict";

/**
 * Escalera de sanciones. El nivel es el peso total de los avisos activos:
 *   1      aviso en el chat
 *   2      aviso reiterado
 *   3      aislamiento (LUXU_TIMEOUT_MINUTES) + aviso
 *   4..K-1 aislamiento de 60 min + alerta a moderadores
 *   >= K   expulsión (o baneo si LUXU_AUTO_BAN está activo y el nivel llega a B)
 * Las amenazas e incitaciones a hacerse daño saltan directamente a expulsión.
 */

const FORCE_KICK = new Set(["threat", "self_harm"]);

function plan({ total, severity, codes = [], cfg }) {
  let level = Math.max(0, total);
  if (severity === "critical") level = Math.max(level, cfg.kickAt - 1);
  if (codes.some(c => FORCE_KICK.has(c))) level = Math.max(level, cfg.kickAt);

  if (level <= 0) return { level, actions: [], alert: false };

  const actions = [{ type: "aviso", tone: level >= 2 ? "fuerte" : "normal" }];
  if (level === 3) actions.push({ type: "aislar", minutos: cfg.timeoutMinutes });
  else if (level >= 4 && level < cfg.kickAt) actions.push({ type: "aislar", minutos: 60 });

  if (level >= cfg.kickAt) {
    actions.push({ type: level >= cfg.banAt && cfg.autoBan ? "banear" : "expulsar" });
  }

  const alert = severity === "high" || severity === "critical" || level >= 4;
  return { level, actions, alert };
}

/** Convierte el plan en textos para el chat. Si hay sanción, el aviso sencillo se omite. */
function render(planned, { name, motivo }) {
  const who = name ? `@${name}` : "el usuario";
  const sanctioned = planned.actions.some(a => a.type !== "aviso");
  return planned.actions.flatMap(action => {
    if (action.type === "aviso") {
      if (sanctioned) return [];
      const text = action.tone === "fuerte"
        ? `🚫 ${who}, este es un aviso reiterado (${motivo}). La próxima infracción tendrá sanciones.`
        : `⚠️ ${who}, Luxu retiró un mensaje (${motivo}). Es un aviso: revisa las normas de la sala.`;
      return [{ ...action, text }];
    }
    if (action.type === "aislar") {
      return [{ ...action, text: `🔒 ${who} ha sido aislado ${action.minutos} min por acumular avisos (${motivo}).` }];
    }
    if (action.type === "expulsar") {
      return [{ ...action, text: `⛔ ${who} ha sido expulsado de la comunidad por reincidencia.` }];
    }
    if (action.type === "banear") {
      return [{ ...action, text: `⛔ ${who} ha sido baneado por reincidencia grave.` }];
    }
    return [action];
  });
}

module.exports = { plan, render, FORCE_KICK };
