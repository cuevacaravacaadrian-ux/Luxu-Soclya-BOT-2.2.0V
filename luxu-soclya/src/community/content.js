"use strict";

const CHISTES = [
  "¿Qué le dijo un bit al otro? Nos vemos en el bus.",
  "¿Por qué el libro de matemáticas estaba triste? Porque tenía demasiados problemas.",
  "¿Qué hace una abeja en el gimnasio? ¡Zumba!",
  "—Doctor, creo que soy invisible. —¡Siguiente!",
  "¿Cuál es el colmo de un electricista? Que su mujer se llame Luz y sus hijos le sigan la corriente.",
  "¿Por qué los pájaros vuelan hacia el sur? Porque caminar es muy largo.",
  "¿Qué le dice un semáforo a otro? No me mires, que me estoy cambiando.",
  "Mi ordenador me dijo que tenía poca batería. Le dije: pues cárgate tú.",
  "¿Cómo se llama el campeón de buceo japonés? Tokofondo.",
  "¿Qué le dijo el 0 al 8? ¡Qué bonito cinturón!",
  "¿Por qué los programadores odian la naturaleza? Tiene demasiados bugs.",
  "¿Qué le dice una impresora a otra? ¿Esa hoja es tuya o es una impresión mía?"
];

const FRASES = [
  "Hoy es buen día para aprender algo nuevo.",
  "Los pequeños pasos también llegan lejos.",
  "La comunidad se construye con respeto.",
  "No hace falta tener razón para ser amable.",
  "Respira, sonríe y sigue adelante.",
  "Lo que compartes con cuidado vuelve multiplicado.",
  "Cada conversación es una oportunidad de caer mejor.",
  "Tu opinión importa, y también la de los demás.",
  "Hacer preguntas es la forma más rápida de aprender.",
  "Hoy tampoco hace falta ser perfecto, basta con ser constante."
];


const CUMPLIDOS = [
  "Tu buen humor se nota en cada mensaje 😊",
  "Eres de esas personas que hacen mejor la comunidad.",
  "Explicas las cosas de una forma que da gusto leer.",
  "Qué bien que estés por aquí.",
  "Tu energía contagia. Sigue así."
];

const PIROPOS = [
  "Si la simpatía fuera deporte, serías medalla de oro.",
  "Eres como el wifi: se te necesita aunque no se vea.",
  "Con gente como tú, el chat tiene mejor ambiente."
];

const DATOS = [
  "El pulpo tiene tres corazones.",
  "La miel casi nunca caduca si se guarda bien cerrada.",
  "Los delfines se llaman entre ellos con silbidos propios.",
  "Una nube media pesa cientos de toneladas.",
  "El ojo humano distingue millones de colores.",
  "Las abejas son capaces de reconocer caras humanas."
];

const REFRANES = [
  "Más vale pájaro en mano que ciento volando.",
  "A quien madruga, Dios le ayuda.",
  "Gota a gota se llena el vaso.",
  "No por mucho madrugar amanece más temprano.",
  "Camarón que se duerme, se lo lleva la corriente."
];

const RETOS = [
  "Escribe el resto del día sin usar la letra «e». ¡Tú puedes!",
  "Comparte una canción que te encante y di por qué.",
  "Cuenta un logro de esta semana, por pequeño que sea.",
  "Recomienda un libro, serie o juego en una sola frase.",
  "Escribe un trabalenguas en español y reta a alguien a repetirlo."
];

const DIVERTIR = { chiste: CHISTES, frase: FRASES, cumplido: CUMPLIDOS, piropo: PIROPOS, dato: DATOS, refran: REFRANES, reto: RETOS };

const BOLA = [
  "Sí, definitivamente.",
  "Sin duda.",
  "Puedes confiar en ello.",
  "Tal como yo lo veo, sí.",
  "Lo más probable.",
  "Las perspectivas son buenas.",
  "Sí.",
  "Las señales apuntan a que sí.",
  "Respuesta confusa, prueba otra vez.",
  "Pregunta más tarde.",
  "Mejor no te lo digo ahora.",
  "No puedo predecirlo.",
  "Concéntrate y vuelve a preguntar.",
  "No cuentes con ello.",
  "Mi respuesta es no.",
  "Mis fuentes dicen que no.",
  "Las perspectivas no son buenas.",
  "Muy dudoso.",
  "Sin duda, no.",
  "Rotundamente no."
];

const AI_OFF = [
  "Mi cerebro de IA está apagado en este servidor. Usa /ayuda para ver lo que sí sé hacer.",
  "La IA no está configurada todavía. Pide a un administrador que añada la clave de IA."
];

const AI_DOWN = [
  "Ahora mismo no puedo pensar bien. Inténtalo de nuevo en un rato.",
  "Se me ha trabado la respuesta. Prueba otra vez dentro de unos minutos."
];

const AI_EMPTY = ["No sé qué decir a eso 🤔. ¿Lo reformulas?"];

const HELP = [
  "🛡️ **Luxu** · seguridad 70% · comunidad 30%",
  "",
  "**Seguridad**: moderación automática, palabrotas, estafas, spam y amenazas. Consulta /normas y tu historial con /perfil.",
  "",
  "**Comunidad**: /resumen /divertir /reportar /dado /moneda /8ball /ppt /ship /elige /encuesta /preguntar",
  "**Info**: /estado · /ayuda",
  "",
  "**Admins**: /casos /caso /advertir /perdonar /confiar /bloquear /moderar /palabras /sospechosos /vigilancia"
].join("\n");

module.exports = { CHISTES, FRASES, CUMPLIDOS, PIROPOS, DATOS, REFRANES, RETOS, DIVERTIR, BOLA, AI_OFF, AI_DOWN, AI_EMPTY, HELP };
