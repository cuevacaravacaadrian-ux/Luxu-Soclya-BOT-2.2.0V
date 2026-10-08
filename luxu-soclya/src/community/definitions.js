"use strict";

/**
 * Los 25 comandos con barra que Luxu registra en Soclya (PUT /comandos).
 * Límite de la plataforma: 25 por bot, 10 opciones por comando.
 * Las obligatorias van primero y el texto libre va al final.
 */

const usuario = (descripcion, obligatoria = true) => ({ nombre: "usuario", tipo: "usuario", descripcion, obligatoria });
const texto = (nombre, descripcion, obligatoria = true) => ({ nombre, tipo: "texto", descripcion, obligatoria });

const COMMANDS = [
  { nombre: "ayuda", descripcion: "Qué sabe hacer Luxu" },
  { nombre: "estado", descripcion: "Estado de Luxu, la moderación y la vigilancia" },
  { nombre: "perfil", descripcion: "Tu historial en la comunidad (o el de otro, si eres admin)", opciones: [
    usuario("Usuario a consultar", false)
  ] },
  { nombre: "normas", descripcion: "Normas de la comunidad" },
  { nombre: "resumen", descripcion: "Resumen de lo que se ha hablado en esta sala" },
  { nombre: "reportar", descripcion: "Avisa a los moderadores de un comportamiento", opciones: [
    usuario("Usuario reportado"),
    texto("motivo", "Qué ha pasado")
  ] },
  { nombre: "divertir", descripcion: "Chiste, frase, cumplido, dato, reto…", opciones: [
    { nombre: "tipo", tipo: "eleccion", descripcion: "Qué quieres", obligatoria: true,
      elecciones: ["chiste", "frase", "cumplido", "piropo", "dato", "refran", "reto"] }
  ] },
  { nombre: "dado", descripcion: "Tira un dado", opciones: [
    { nombre: "caras", tipo: "entero", descripcion: "Número de caras (2-1000)", obligatoria: false }
  ] },
  { nombre: "moneda", descripcion: "Cara o cruz" },
  { nombre: "8ball", descripcion: "Pregunta a la bola mágica", opciones: [texto("pregunta", "Tu pregunta")] },
  { nombre: "ppt", descripcion: "Piedra, papel o tijera contra Luxu", opciones: [
    { nombre: "jugada", tipo: "eleccion", descripcion: "Tu jugada", obligatoria: true, elecciones: ["piedra", "papel", "tijera"] }
  ] },
  { nombre: "ship", descripcion: "Compatibilidad entre dos cosas", opciones: [
    texto("primera", "Primera"),
    texto("segunda", "Segunda")
  ] },
  { nombre: "elige", descripcion: "Luxu elige por ti", opciones: [texto("opciones", "Separadas por comas")] },
  { nombre: "encuesta", descripcion: "Encuesta con botones que se actualiza sola", opciones: [
    texto("pregunta", "Pregunta (entre comillas si tiene espacios)"),
    texto("opciones", "De 2 a 5, separadas por comas")
  ] },
  { nombre: "preguntar", descripcion: "Pregunta a la IA de Luxu", opciones: [texto("pregunta", "Tu pregunta")] },

  { nombre: "casos", descripcion: "[Admin] Últimos casos, o el detalle de uno", opciones: [texto("id", "Id del caso (opcional)", false)] },
  { nombre: "historial", descripcion: "[Owner] Sanciones de alguien en todos los servidores", opciones: [usuario("Usuario")] },
  { nombre: "advertir", descripcion: "[Admin] Aviso manual que cuenta en el historial", opciones: [
    usuario("Usuario"),
    texto("motivo", "Motivo del aviso")
  ] },
  { nombre: "perdonar", descripcion: "[Admin] Borra los avisos activos de alguien", opciones: [usuario("Usuario")] },
  { nombre: "confiar", descripcion: "[Admin] Marca o quita la confianza (no se modera)", opciones: [
    usuario("Usuario"),
    { nombre: "activo", tipo: "booleano", descripcion: "true para confiar, false para quitarla", obligatoria: false }
  ] },
  { nombre: "bloquear", descripcion: "[Admin] Modera todo lo que escriba (o lo libera)", opciones: [
    usuario("Usuario"),
    { nombre: "activo", tipo: "booleano", descripcion: "true bloquea, false libera", obligatoria: false },
    texto("motivo", "Motivo (opcional)", false)
  ] },
  { nombre: "moderar", descripcion: "[Admin] Aísla, expulsa o banea a mano", opciones: [
    usuario("Usuario"),
    { nombre: "accion", tipo: "eleccion", descripcion: "Acción", obligatoria: true, elecciones: ["aislar", "expulsar", "banear"] },
    { nombre: "minutos", tipo: "entero", descripcion: "Minutos (solo aislar)", obligatoria: false },
    texto("motivo", "Motivo (opcional)", false)
  ] },
  { nombre: "palabras", descripcion: "[Admin] Gestiona las palabras prohibidas propias", opciones: [
    { nombre: "accion", tipo: "eleccion", descripcion: "Qué hacer", obligatoria: true, elecciones: ["anadir", "quitar", "listar"] },
    texto("palabra", "La palabra (solo para añadir o quitar)", false)
  ] },
  { nombre: "sospechosos", descripcion: "[Admin] Usuarios con más avisos activos" },
  { nombre: "vigilancia", descripcion: "[Admin] Estado de la vigilancia del servidor" }
];

module.exports = { COMMANDS };
