"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig } = require("../src/config");
const { createBot } = require("../src/bot");
const { startMockSoclya, waitFor } = require("./helpers/mockSoclya");

const silent = { info() {}, warn() {}, error() {}, debug() {}, fatal() {} };

function interaction({ id, nombre, opciones = {}, autor = { id: "U-1", username: "pepe" }, tipo = "comando", boton = null, texto = "" }) {
  return {
    tipo,
    id,
    sala: { id: "S-1" },
    servidor: { id: "SV-1" },
    autor,
    mensaje: { id: "M-IX", texto, autor_id: autor.id },
    comando: tipo === "comando" ? { nombre, argumentos: "", opciones } : null,
    boton,
    enviado_en: new Date().toISOString()
  };
}

function message({ id, userId = "U-1", username = "pepe", texto }) {
  return { id, autor: { id: userId, username, bot: false }, texto, creado_en: Date.now(), menciones: [], adjuntos: [] };
}

const answerOf = (soclya, id) => soclya.calls.find(c => c.path === `/api/v1/interacciones/${id}/responder`);

test("flujo completo: moderación, palabrotas, comandos, memoria, vigilancia y resiliencia", async t => {
  const soclya = await startMockSoclya();
  t.after(() => soclya.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "luxu-e2e-"));
  const config = loadConfig({
    SOCLYA_BOT_TOKEN: "token-prueba",
    SOCLYA_API_BASE: soclya.base,
    LUXU_DATA_DIR: dataDir,
    LUXU_OUTBOX_INTERVAL_MS: "0",
    LUXU_AI_ENABLED: "false",
    LUXU_WATCH_ENABLED: "false",
    LUXU_ALERT_SALA_ID: "SALA-ALERTAS",
    LUXU_ADMIN_IDS: "ADMIN-1",
    LUXU_ADMIN_USERNAMES: "@adricc, gabriel",
    LUXU_OWNER_IDS: "OWNER-1",
    LUXU_LOG_LEVEL: "silent"
  });
  const bot = createBot(config, { logger: silent });
  t.after(() => bot.stop());
  await bot.start();

  // 1) Arranque: gateway, registro de los 25 comandos con el token del bot.
  await waitFor(() => bot.gateway.connected, { label: "gateway conectado" });
  await waitFor(() => soclya.calls.some(c => c.method === "PUT" && c.path === "/api/v1/comandos"), { label: "comandos registrados" });
  const registered = soclya.calls.find(c => c.path === "/api/v1/comandos");
  assert.equal(registered.body.comandos.length, 25, "exactamente 25 comandos (límite de la plataforma)");
  for (const name of ["moderar", "perfil", "divertir", "vigilancia", "palabras"]) {
    assert.ok(registered.body.comandos.some(c => c.nombre === name), `comando ${name}`);
  }
  assert.equal(registered.auth, "Bot token-prueba");

  // 2) Insulto: la API lo censura, Luxu borra y avisa con un aviso reiterado (nivel 2), sin aislar.
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "M-1", texto: "eres un idiota" }));
  await waitFor(() => soclya.calls.some(c => c.method === "DELETE" && c.path === "/api/v1/salas/S-1/mensajes/M-1"), { label: "borrado M-1" });
  await waitFor(() => soclya.calls.some(c => c.method === "POST" && c.path === "/api/v1/salas/S-1/mensajes" && /@pepe/.test(c.body.texto)), { label: "aviso a pepe" });
  assert.ok(!soclya.calls.some(c => c.path.endsWith("/miembros/U-1")), "dos avisos no aíslan todavía");

  // 3) Estafa con enlace acortado: crítica, aislamiento de 60 min y alerta.
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "M-2", userId: "U-2", username: "troll", texto: "GRATIS NITRO aquí https://bit.ly/x1" }));
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/servidores/SV-1/miembros/U-2"), { label: "aislamiento de troll" });
  const isolation = soclya.calls.find(c => c.path === "/api/v1/servidores/SV-1/miembros/U-2");
  assert.equal(isolation.body.accion, "aislar");
  assert.equal(isolation.body.minutos, 60);
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/salas/SALA-ALERTAS/mensajes"), { label: "alerta a moderadores" });
  assert.ok(!soclya.calls.some(c => c.path.endsWith("/miembros/U-2") && c.body.accion === "banear"), "no banea sin LUXU_AUTO_BAN");

  // 4) Mensaje limpio: ninguna escritura.
  await bot.outbox.drain(2000);
  const before = soclya.calls.length;
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "M-3", userId: "U-3", username: "ana2", texto: "¡Buenos días a todos!" }));
  await waitFor(() => bot.store.peekUser("U-3")?.messages === 1, { label: "U-3 procesado" });
  const writes = soclya.calls.slice(before).filter(c => c.method !== "POST" || !c.path.endsWith("/moderacion/texto"));
  assert.equal(writes.length, 0, "un mensaje limpio no provoca escrituras");

  // 5) Palabrotas en modo estricto: la escalera llega a la expulsión en el 5.º aviso.
  for (let i = 0; i < 5; i++) {
    soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: `P-${i}`, userId: "U-5", username: "bocazas", texto: `qué mierda de día número ${i}` }));
  }
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/servidores/SV-1/miembros/U-5" && c.body.accion === "expulsar"), { timeoutMs: 6000, label: "expulsión por reincidencia" });
  const kicked = soclya.calls.filter(c => c.path === "/api/v1/servidores/SV-1/miembros/U-5");
  assert.ok(kicked.some(c => c.body.accion === "aislar" && c.body.minutos === 60), "antes de expulsar, aislamiento de 60 min");
  await waitFor(() => soclya.calls.some(c => c.method === "POST" && /expulsado de la comunidad/.test(c.body?.texto || "")), { label: "aviso público de expulsión" });

  // 6) Comandos de diversión y utilidad.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~dado", nombre: "dado", opciones: { caras: 20 } }));
  await waitFor(() => answerOf(soclya, "S-1~dado"), { label: "/dado" });
  assert.match(answerOf(soclya, "S-1~dado").body.texto, /d20/);

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~div", nombre: "divertir", opciones: { tipo: "chiste" } }));
  await waitFor(() => answerOf(soclya, "S-1~div"), { label: "/divertir" });
  assert.ok(answerOf(soclya, "S-1~div").body.texto.length > 5);

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~norm", nombre: "normas" }));
  await waitFor(() => answerOf(soclya, "S-1~norm"), { label: "/normas" });
  assert.match(answerOf(soclya, "S-1~norm").body.texto, /Respeto/);

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~perf", nombre: "perfil" }));
  await waitFor(() => answerOf(soclya, "S-1~perf"), { label: "/perfil propio" });
  assert.match(answerOf(soclya, "S-1~perf").body.texto, /@pepe/);
  assert.equal(answerOf(soclya, "S-1~perf").body.efimero, true);

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~perf2", nombre: "perfil", opciones: { usuario: "ana" } }));
  await waitFor(() => answerOf(soclya, "S-1~perf2"), { label: "/perfil ajeno denegado" });
  assert.match(answerOf(soclya, "S-1~perf2").body.texto, /propio perfil/);

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~res", nombre: "resumen" }));
  await waitFor(() => answerOf(soclya, "S-1~res"), { label: "/resumen" });
  assert.match(answerOf(soclya, "S-1~res").body.texto, /participantes/);

  // 7) Reportes: llegan a la sala de alertas.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~rep", nombre: "reportar", opciones: { usuario: "troll", motivo: "spam de enlaces" } }));
  await waitFor(() => answerOf(soclya, "S-1~rep"), { label: "/reportar" });
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/salas/SALA-ALERTAS/mensajes" && /Reporte de @pepe sobre @troll/.test(c.body.texto)), { label: "reporte en alertas" });

  // 8) Permisos: un usuario normal no modera; un admin sí.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~mod0", nombre: "moderar", opciones: { usuario: "ana", accion: "aislar", minutos: 5 } }));
  await waitFor(() => answerOf(soclya, "S-1~mod0"), { label: "/moderar denegado" });
  assert.match(answerOf(soclya, "S-1~mod0").body.texto, /administradores/);
  assert.ok(!soclya.calls.some(c => c.path === "/api/v1/servidores/SV-1/miembros/u-9"));

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~mod1", nombre: "moderar", autor: { id: "ADMIN-1", username: "admin" }, opciones: { usuario: "ana", accion: "aislar", minutos: 5 } }));
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/servidores/SV-1/miembros/u-9"), { label: "/moderar admin" });
  const manual = soclya.calls.find(c => c.path === "/api/v1/servidores/SV-1/miembros/u-9");
  assert.deepEqual({ accion: manual.body.accion, minutos: manual.body.minutos }, { accion: "aislar", minutos: 5 });

  // 9) Palabras propias: el admin añade una palabra y el sistema la castiga.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~pal", nombre: "palabras", autor: { id: "ADMIN-1", username: "admin" }, opciones: { accion: "anadir", palabra: "chorradica" } }));
  await waitFor(() => answerOf(soclya, "S-1~pal"), { label: "/palabras añadir" });
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "W-1", userId: "U-7", username: "nuevo", texto: "esto es una chorradica enorme" }));
  await waitFor(() => soclya.calls.some(c => c.method === "DELETE" && c.path === "/api/v1/salas/S-1/mensajes/W-1"), { label: "palabra propia castigada" });

  // 10) Advertencia manual y perdón.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~adv", nombre: "advertir", autor: { id: "ADMIN-1", username: "admin" }, opciones: { usuario: "ana", motivo: "tono hiriente" } }));
  await waitFor(() => answerOf(soclya, "S-1~adv"), { label: "/advertir" });
  assert.match(answerOf(soclya, "S-1~adv").body.texto, /Aviso aplicado/);
  assert.ok(soclya.calls.some(c => c.method === "POST" && /@ana/.test(c.body?.texto || "") && /tono hiriente/.test(c.body?.texto || "")));

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~sos", nombre: "sospechosos", autor: { id: "ADMIN-1", username: "admin" } }));
  await waitFor(() => answerOf(soclya, "S-1~sos"), { label: "/sospechosos" });
  assert.match(answerOf(soclya, "S-1~sos").body.texto, /@bocazas/);

  // 11) Encuesta con botones: crear, votar y ver el resultado actualizado.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~poll", nombre: "encuesta", opciones: { pregunta: "¿Pizza o sushi?", opciones: "Pizza, Sushi" } }));
  await waitFor(() => answerOf(soclya, "S-1~poll"), { label: "encuesta" });
  const buttonId = answerOf(soclya, "S-1~poll").body.botones[1].id;
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~vote", tipo: "boton", boton: { id: buttonId }, autor: { id: "U-3", username: "ana2" } }));
  await waitFor(() => answerOf(soclya, "S-1~vote"), { label: "voto" });
  assert.match(answerOf(soclya, "S-1~vote").body.texto, /Sushi: \*\*1\*\*/);

  // 11b) Admin por nombre de usuario: @adricc sanciona aunque su id no esté en la lista.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~adricc", nombre: "moderar", autor: { id: "NOID-7", username: "adricc" }, opciones: { usuario: "ana", accion: "aislar", minutos: 7 } }));
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/servidores/SV-1/miembros/u-9" && c.body.minutos === 7), { label: "moderar por nombre de admin" });
  // Y sus mensajes quedan exentos del moderador aunque sean una palabrota.
  const exemptBefore = soclya.calls.length;
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "A-1", userId: "NOID-7", username: "adricc", texto: "eres una mierda, de broma" }));
  await bot.outbox.drain(1000);
  assert.equal(soclya.calls.slice(exemptBefore).filter(c => c.method === "DELETE").length, 0, "el admin por nombre no es moderado");

  // 11c) Historial entre servidores: solo owners; un admin normal no lo ve.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~hist0", nombre: "historial", autor: { id: "ADMIN-1", username: "admin" }, opciones: { usuario: "troll" } }));
  await waitFor(() => answerOf(soclya, "S-1~hist0"), { label: "/historial denegado a admin" });
  assert.match(answerOf(soclya, "S-1~hist0").body.texto, /solo lo ven los owners/);
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~hist1", nombre: "historial", autor: { id: "OWNER-1", username: "dueño" }, opciones: { usuario: "troll" } }));
  await waitFor(() => answerOf(soclya, "S-1~hist1"), { label: "/historial de owner" });
  assert.match(answerOf(soclya, "S-1~hist1").body.texto, /Historial de @troll/);
  assert.match(answerOf(soclya, "S-1~hist1").body.texto, /Servidor SV-1/);

  // 12) Mención sin IA: respuesta amable de fallback.
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~men", tipo: "mencion", texto: "@luxu ¿qué sabes hacer?" }));
  await waitFor(() => answerOf(soclya, "S-1~men"), { label: "mención" });
  assert.ok(answerOf(soclya, "S-1~men").body.texto.length > 10);

  // 13) Antifallos: la moderación de Soclya cae; Luxu sigue con reglas locales y borra la palabrota.
  soclya.state.moderationDown = true;
  soclya.push("MENSAJE_CREADO", "S-1", "SV-1", message({ id: "M-9", userId: "U-9", username: "nuevo2", texto: "eres un imbécil total" }));
  await waitFor(() => bot.moderator.counters.apiFailures >= 1, { label: "fallo de moderación registrado" });
  await waitFor(() => soclya.calls.some(c => c.method === "DELETE" && c.path === "/api/v1/salas/S-1/mensajes/M-9"), { label: "reglas locales sin API" });
  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~ping", nombre: "estado" }));
  await waitFor(() => answerOf(soclya, "S-1~ping"), { label: "/estado con API caída" });
  soclya.state.moderationDown = false;

  // 14) Vigilancia: foto base, cambios reales (sala renombrada y bot añadido) y alerta.
  bot.watcher.lastTick = 0;
  await bot.watcher.tick();
  assert.ok(bot.store.getWatch("SV-1"), "foto base guardada");
  soclya.state.rooms["SV-1"][0].nombre = "general-renombrada";
  soclya.state.members.push({ id: "B-1", username: "bot-x", bot: true });
  await bot.watcher.tick();
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/salas/SALA-ALERTAS/mensajes" && /renombrada/.test(c.body.texto)), { label: "alerta de sala renombrada" });
  await waitFor(() => soclya.calls.some(c => c.path === "/api/v1/salas/SALA-ALERTAS/mensajes" && /bot-x/.test(c.body.texto)), { label: "alerta de bot añadido" });

  soclya.push("INTERACCION", "S-1", "SV-1", interaction({ id: "S-1~vig", nombre: "vigilancia", autor: { id: "ADMIN-1", username: "admin" } }));
  await waitFor(() => answerOf(soclya, "S-1~vig"), { label: "/vigilancia" });
  assert.match(answerOf(soclya, "S-1~vig").body.texto, /Servidores vigilados: 1/);

  // 15) Gateway: si se corta la conexión, reconecta.
  const discoveries = soclya.calls.filter(c => c.path === "/api/v1/gateway").length;
  soclya.dropConnections();
  await waitFor(() => soclya.calls.filter(c => c.path === "/api/v1/gateway").length > discoveries, { timeoutMs: 6000, label: "nuevo descubrimiento de gateway" });
  await waitFor(() => bot.gateway.connected, { timeoutMs: 6000, label: "gateway reconectado" });

  // 16) Apagado limpio y persistencia.
  await bot.stop();
  assert.equal(bot.gateway.connected, false);
  const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "state.json"), "utf8"));
  assert.deepEqual(persisted.cases.map(c => c.messageId).filter(id => ["M-1", "M-2"].includes(id)).sort(), ["M-1", "M-2"]);
  assert.ok(persisted.users["U-2"].warnings.length >= 1, "los avisos persisten");
  assert.ok(persisted.reports.length === 1, "el reporte queda guardado");
  assert.ok(persisted.watch["SV-1"], "la vigilancia queda guardada");
});
