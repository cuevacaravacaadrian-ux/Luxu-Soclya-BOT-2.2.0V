"use strict";

const http = require("http");
const { WebSocketServer } = require("ws");

/**
 * Servidor que imita la API y el gateway de Soclya lo justo para probar el bot.
 * Registra cada peticion en `calls` y permite tirar la conexion WebSocket o
 * simular que la moderacion esta caida.
 */
function classify(texto) {
  if (/idiota/i.test(texto)) return { aprobado: true, texto_censurado: "eres un ******", motivo: null, categorias: ["harassment"], confianza: 0.65, accion: "censurar" };
  if (/nitro/i.test(texto)) return { aprobado: false, texto_censurado: null, motivo: "Oferta de estafa", categorias: ["illegal_activity"], confianza: 0.9, accion: "bloquear" };
  return { aprobado: true, texto_censurado: null, motivo: null, categorias: [], confianza: 0.9, accion: "permitir" };
}

async function startMockSoclya() {
  const calls = [];
  const sockets = new Set();
  const state = {
    moderationDown: false,
    members: [{ id: "u-9", username: "ana", bot: false }],
    servers: [{ id: "SV-1", nombre: "Comunidad Test", descripcion: "Pruebas" }],
    rooms: { "SV-1": [{ id: "S-1", nombre: "general", tema: "", tipo: "texto" }, { id: "S-2", nombre: "anuncios", tema: "", tipo: "anuncios" }] }
  };

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://localhost");
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: req.headers.authorization });

    const send = (status, payload) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload === undefined ? "" : JSON.stringify(payload));
    };
    const p = url.pathname;

    if (req.method === "GET" && p === "/api/v1/gateway") {
      return send(200, { ok: true, data: { url: `ws://127.0.0.1:${server.address().port}/gw`, latido_ms: 150, conexiones_max: 3 } });
    }
    if (req.method === "POST" && p === "/api/v1/moderacion/texto") {
      if (state.moderationDown) return send(503, { ok: false, error: "Mantenimiento", codigo: "mantenimiento" });
      return send(200, { ok: true, data: classify(body.texto) });
    }
    if (req.method === "PUT" && p === "/api/v1/comandos") return send(200, { ok: true, data: { comandos: body.comandos.length } });
    if (req.method === "DELETE" && /\/salas\/[^/]+\/mensajes\/[^/]+$/.test(p)) return send(204);
    if (req.method === "POST" && /\/salas\/[^/]+\/mensajes$/.test(p)) return send(200, { ok: true, data: { id: "m-new" } });
    if (req.method === "POST" && /\/interacciones\/[^/]+\/responder$/.test(p)) return send(200, { ok: true, data: {} });
    if (req.method === "POST" && /\/servidores\/[^/]+\/miembros\/[^/]+$/.test(p)) return send(200, { ok: true, data: {} });
    if (req.method === "GET" && p === "/api/v1/servidores") return send(200, { ok: true, data: state.servers });
    if (req.method === "GET" && /\/servidores\/[^/]+\/salas$/.test(p)) {
      return send(200, { ok: true, data: state.rooms[p.split("/")[4]] || [] });
    }
    if (req.method === "GET" && /\/servidores\/[^/]+\/miembros$/.test(p)) {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return send(200, { ok: true, data: state.members.filter(m => m.username.includes(q)) });
    }
    return send(404, { ok: false, error: "No existe", codigo: "no_encontrado" });
  });

  const wss = new WebSocketServer({ server, path: "/gw" });
  const hello = { op: "hola", latido_ms: 150, bot: { id: "BOT-1", username: "luxu" }, servidores: [] };
  wss.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("message", raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.op === "latido") socket.send(JSON.stringify({ op: "latido_ok" }));
    });
    socket.send(JSON.stringify(hello));
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  return {
    base,
    calls,
    state,
    push(evento, sala_id, servidor_id, datos) {
      const payload = JSON.stringify({ op: "evento", evento, sala_id, servidor_id, datos });
      for (const socket of sockets) socket.send(payload);
    },
    dropConnections() {
      for (const socket of sockets) socket.terminate();
    },
    connections() {
      return sockets.size;
    },
    async close() {
      for (const socket of sockets) socket.terminate();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

async function waitFor(predicate, { timeoutMs = 4000, intervalMs = 25, label = "condicion" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Tiempo agotado esperando: ${label}`);
}

module.exports = { startMockSoclya, waitFor };
