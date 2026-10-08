"use strict";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class HttpError extends Error {
  constructor(message, { status = 0, codigo = null } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.codigo = codigo;
  }
}

function backoffMs(attempt, retryAfter) {
  const seconds = Number(retryAfter);
  if (retryAfter !== undefined && retryAfter !== null && Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(30_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

/**
 * fetch con timeout y reintentos seguros.
 * - 429 se reintenta siempre (la peticion no se proceso).
 * - Errores de red y 5xx solo se reintentan si la peticion es idempotente,
 *   para no duplicar mensajes ni acciones de moderacion.
 */
async function request(url, opts = {}) {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 10_000,
    retries = 0,
    idempotent = method === "GET" || method === "PUT" || method === "DELETE"
  } = opts;

  const payload = body === undefined ? undefined : JSON.stringify(body);
  const finalHeaders = payload === undefined ? { ...headers } : { "content-type": "application/json", ...headers };

  for (let attempt = 1; ; attempt++) {
    let res;
    let text;
    try {
      res = await fetch(url, {
        method,
        headers: finalHeaders,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs)
      });
      text = await res.text();
    } catch (err) {
      if (idempotent && attempt <= retries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      let host = "servidor";
      try { host = new URL(url).host; } catch {}
      throw new HttpError(`Sin conexión con ${host}: ${err.name === "TimeoutError" ? "tiempo agotado" : err.message}`);
    }

    const retriable = res.status === 429 || (idempotent && res.status >= 500);
    if (retriable && attempt <= retries) {
      await sleep(backoffMs(attempt, res.headers.get("retry-after")));
      continue;
    }

    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = null; }
    }
    return { status: res.status, ok: res.ok, json, text };
  }
}

module.exports = { request, HttpError, sleep, backoffMs };
