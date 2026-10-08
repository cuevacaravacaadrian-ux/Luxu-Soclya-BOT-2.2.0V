"use strict";

/**
 * Puntuación 0-100 y gravedad. Umbrales: baja < 35 <= media < 60 <= alta < 85 <= crítica.
 * Cada gravedad suma "peso" a los avisos del usuario; el peso acumulado decide la sanción.
 */

const CRITICAL_CATEGORIES = new Set(["violence_threat", "sexual_minor", "self_harm"]);
const WEIGHTS = { none: 0, low: 0, medium: 1, high: 2, critical: 3 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function severityOf(score) {
  if (score >= 85) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score > 0) return "low";
  return "none";
}

function warningWeight(severity) {
  return WEIGHTS[severity] ?? 0;
}

/** Puntos a partir de la respuesta de la API de moderación de Soclya. */
function apiPoints(api) {
  if (!api || !api.accion) return 0;
  const confidence = clamp(Number(api.confianza ?? 0.5), 0, 1);
  const categories = new Set(api.categorias || []);
  if (api.accion === "bloquear") {
    const base = [...categories].some(c => CRITICAL_CATEGORIES.has(c)) ? 95 : 70;
    return Math.round(base * (0.5 + confidence / 2));
  }
  if (api.accion === "censurar") return Math.round(30 * (0.5 + confidence / 2));
  return 0;
}

function activityPoints({ rate = false, spam = false, repeat = false } = {}) {
  let points = 0;
  if (rate) points += 30;
  if (spam) points += 35;
  if (repeat) points += 25;
  return Math.min(50, points);
}

/** Suma las señales. Los avisos activos añaden un extra, pero nunca disparan nada por sí solos. */
function combine({ local = 0, activity = 0, api = 0, warnings = 0, sensitivity = 1 }) {
  const base = local + activity + api;
  if (base <= 0) return 0;
  const bonus = Math.min(20, warnings * 4);
  return clamp(Math.round((base + bonus) * sensitivity), 0, 100);
}

module.exports = { severityOf, warningWeight, apiPoints, activityPoints, combine };
