# Luxu · bot de moderación, seguridad y comunidad para Soclya

[![CI](https://github.com/TU_USUARIO/luxu-soclya/actions/workflows/ci.yml/badge.svg)](https://github.com/TU_USUARIO/luxu-soclya/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)
![Licencia](https://img.shields.io/badge/licencia-MIT-blue)

Luxu es un bot para [Soclya](https://soclya.com) con un reparto **70% seguridad / 30% comunidad**.

- **Seguridad:** lee el chat en tiempo real, borra palabrotas e insultos (en modo estricto por defecto), avisa al usuario en el chat, escala las sanciones (aviso → aislamiento → expulsión → baneo) según el historial, detecta estafas, spam, raids y campañas coordinadas, y vigila los cambios visibles del servidor.
- **Comunidad:** memoria de la conversación, resúmenes de sala, reportes de usuarios, juegos y encuestas, y un asistente con IA al que se puede preguntar o mencionar.

Funciona sin servidor público: se conecta al **gateway** de Soclya por WebSocket, así que sirve desde tu ordenador, una Raspberry o cualquier VPS.

> **Importante:** Luxu solo ve lo que su rol de bot le permite ver, y solo puede hacer lo que su rol le permite hacer. Lee la sección [Límites de la API](#límites-de-la-api-lo-que-luxu-no-puede-saber) antes de desplegarlo.

---

## Índice

- [Qué hace](#qué-hace)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Permisos del bot en Soclya](#permisos-del-bot-en-soclya)
- [Configuración](#configuración)
- [Comandos](#comandos)
- [Cómo funciona la moderación](#cómo-funciona-la-moderación)
- [Vigilancia del servidor](#vigilancia-del-servidor)
- [Memoria](#memoria)
- [Límites de la API (lo que Luxu no puede saber)](#límites-de-la-api-lo-que-luxu-no-puede-saber)
- [Resiliencia](#resiliencia)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Tests](#tests)
- [Despliegue](#despliegue)
- [Contribuir y seguridad](#contribuir-y-seguridad)
- [Licencia](#licencia)

---

## Qué hace

| Área | Qué hace Luxu |
|---|---|
| **Lectura continua** | Recibe cada mensaje y cada edición de las salas que puede ver, en tiempo real. |
| **Palabrotas** | Lista por niveles (suaves, medias, fuertes, discriminatorias), con detección de tildes, leet speak, letras repetidas y letras separadas. Modo estricto por defecto. Palabras propias con `/palabras`. |
| **Avisos en el chat** | Cada infracción se retira y se avisa en el chat con un mensaje claro, sin insultar al usuario. |
| **Escalera de sanciones** | Aviso → aviso reiterado → aislamiento → aislamiento largo + alerta → expulsión → baneo (opcional). Los avisos caducan a las 24 h. |
| **Sanciones directas** | Las amenazas y las incitaciones a hacerse daño expulsan de inmediato. |
| **Anti-spam y anti-flood** | Límites por usuario y por sala, mensajes repetidos, menciones masivas y exceso de enlaces. |
| **Estafas y enlaces** | Regalos falsos, robo de credenciales, sorteos de criptomonedas, acortadores sospechosos y campañas de enlaces entre cuentas. |
| **Actividad sospechosa** | Spam coordinado (el mismo mensaje de varias cuentas a la vez), raids (muchas altas en un minuto) y alertas a moderadores con enfriamiento. |
| **Vigilancia del servidor** | Compara periódicamente servidores, salas y miembros; avisa de salas creadas, renombradas o eliminadas, cambios de tema, bots añadidos y altas masivas. |
| **Memoria** | Recuerda el historial de cada usuario (avisos, casos, reportes) y los últimos mensajes de cada sala. |
| **Moderadores** | Casos auditables, perfiles, reportes, avisos manuales, perdón, bloqueo, confianza y acciones manuales. |
| **Comunidad** | Normas, resúmenes, juegos, encuestas con botones y asistente con IA. |

## Requisitos

- **Node.js 20 o superior** (recomendado 22).
- Un **bot de Soclya** con su token: <https://soclya.com/developer/aplicaciones>.
- *(Opcional)* Una clave de la API de Anthropic para la IA (`LUXU_AI_API_KEY`). Sin ella, Luxu responde con frases predefinidas.

## Instalación

**Windows (PowerShell)**

```powershell
git clone https://github.com/TU_USUARIO/luxu-soclya.git
cd luxu-soclya
npm install
Copy-Item .env.example .env
# Edita .env: como mínimo, SOCLYA_BOT_TOKEN y LUXU_ADMIN_IDS
npm start
```

**Linux / macOS**

```bash
git clone https://github.com/TU_USUARIO/luxu-soclya.git
cd luxu-soclya
npm install
cp .env.example .env
# Edita .env
npm start
```

Si falta algo obligatorio, Luxu se detiene al arrancar y dice exactamente qué revisar.

**Primera vez:** deja `LUXU_ACTIONS_ENABLED=false` durante unos días. Luxu registrará lo que habría hecho (con la etiqueta `(simulado)`) sin tocar nada. Revisa `/casos`, ajusta y luego actívalo.

## Permisos del bot en Soclya

Asigna al bot un rol con estos permisos en los servidores donde lo uses. Los nombres exactos pueden variar en el portal de Soclya.

| Permiso | Para qué |
|---|---|
| Ver las salas | Recibir mensajes y comandos |
| Enviar mensajes | Avisos, alertas, bienvenidas y respuestas |
| Usar comandos | Que los miembros usen `/comandos` |
| Gestionar mensajes | Borrar mensajes que incumplen las normas |
| Moderar miembros (aislar, expulsar, banear) | Sanciones sobre miembros |

Si el bot no tiene un permiso, Luxu lo registra como «accion_fallida» y sigue funcionando con el resto.

## Configuración

Todo se configura en `.env`. La plantilla [`.env.example`](.env.example) tiene un comentario para cada opción. Las más importantes:

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SOCLYA_BOT_TOKEN` | — | **Obligatorio.** Token del bot. |
| `LUXU_ADMIN_IDS` / `LUXU_OWNER_IDS` | vacío | Admins por id: pueden usar los comandos de admin y no son moderados. Los owners además ven `/historial`. |
| `LUXU_ADMIN_USERNAMES` | vacío | Admins por nombre de usuario, por ejemplo `adricc,gabriel`. Práctico, pero el id es más seguro para decisiones importantes. |
| `LUXU_ALERT_SALA_ID` | vacío | Sala de moderadores: casos graves, reportes y cambios del servidor. |
| `LUXU_WELCOME_SALA_ID` | vacío | Sala donde se da la bienvenida a los nuevos miembros. |
| `LUXU_RULES` | 5 normas | Normas que muestra `/normas`, separadas por `\|`. |
| `LUXU_PROFANITY_LEVEL` | `3` | 1 = solo insultos fuertes; 2 = + medias; 3 = todo (estricto). |
| `LUXU_ACTIONS_ENABLED` | `true` | Si es `false`, Luxu solo simula las acciones. |
| `LUXU_KICK_AT` / `LUXU_BAN_AT` | `5` / `7` | Nivel al que se expulsa y al que se banea. |
| `LUXU_AUTO_BAN` | `false` | Banear automáticamente al llegar a `LUXU_BAN_AT`. Recomendado dejarlo en `false`. |
| `LUXU_TIMEOUT_MINUTES` | `10` | Minutos de aislamiento en el nivel 3. |
| `LUXU_WARNING_DECAY_HOURS` | `24` | Cuánto dura un aviso. |
| `LUXU_SECURITY_LEVEL` / `LUXU_COMMUNITY_LEVEL` | `70` / `30` | Reparto del bot. La seguridad escala la sensibilidad (70 = normal). |
| `LUXU_SOCLYA_MODERATION` | `true` | Usa también la API de moderación de Soclya para el contexto. |
| `LUXU_WATCH_ENABLED` / `LUXU_WATCH_INTERVAL_MS` | `true` / `120000` | Vigilancia del servidor y cada cuánto revisa. |
| `LUXU_RAID_JOIN_LIMIT` | `8` | Altas en un minuto que se consideran raid. |
| `LUXU_MEMORY_MESSAGES` | `40` | Mensajes recientes que Luxu recuerda por sala. |
| `LUXU_AI_API_KEY` | vacío | Activa `/preguntar`, las menciones y los resúmenes con IA. |

## Comandos

Soclya permite **25 comandos con barra por bot**. Luxu usa los 25: 10 para todos, 15 para admins.

**Para todos**

| Comando | Qué hace |
|---|---|
| `/ayuda` | Lista de comandos. |
| `/estado` | Estado del gateway, la moderación, la IA y la vigilancia, con contadores. |
| `/perfil [usuario]` | Tu historial: mensajes, avisos activos, último caso y reportes. Los admins pueden ver el de otros. |
| `/normas` | Normas de la comunidad. |
| `/resumen` | Resumen de la conversación reciente de la sala: participantes, más activos y temas (con IA, si está activa). |
| `/reportar usuario motivo` | Envía un reporte a los moderadores (una vez por minuto). |
| `/divertir tipo` | Chiste, frase, cumplido, piropo, dato curioso, refrán o reto. |
| `/dado [caras]` | Tira un dado. |
| `/moneda` | Cara o cruz. |
| `/8ball pregunta` | La bola mágica responde. |
| `/ppt jugada` | Piedra, papel o tijera contra Luxu. |
| `/ship primera segunda` | Porcentaje de compatibilidad (siempre el mismo para la misma pareja). |
| `/elige opciones` | Luxu elige por ti entre opciones separadas por comas. |
| `/encuesta pregunta opciones` | Encuesta con botones que se actualiza sola. De 2 a 5 opciones. |
| `/preguntar pregunta` | Pregunta a la IA. También puedes mencionar a Luxu. |

**Solo administradores**

| Comando | Qué hace |
|---|---|
| `/casos [id]` | Últimos casos de moderación, o el detalle de uno con su id. |
| `/historial usuario` | **Solo owners.** Sanciones de una persona en todos los servidores donde está Luxu. No muestra mensajes. Cada consulta queda auditada. |
| `/advertir usuario motivo` | Aviso manual que cuenta en el historial. |
| `/perdonar usuario` | Borra los avisos activos de alguien. |
| `/confiar usuario [activo]` | Marca como confiable (no se modera). `activo=false` lo quita. |
| `/bloquear usuario [activo] [motivo]` | Luxu modera todo lo que escriba esa persona. `activo=false` lo libera. |
| `/moderar usuario accion [minutos] [motivo]` | Aísla, expulsa o banea a mano. |
| `/palabras accion [palabra]` | Añade, quita o lista palabras propias prohibidas. |
| `/sospechosos` | Usuarios con más avisos activos. |
| `/vigilancia` | Estado de la vigilancia: servidores, última revisión y cambios de las últimas 24 h. |

Las respuestas de administración son efímeras: solo las ve quien las pide.

Consejo: si la pregunta tiene espacios, ponla entre comillas, por ejemplo `/encuesta "¿Pizza o sushi?" Pizza, Sushi`.

## Cómo funciona la moderación

Cada mensaje y cada edición pasa por este orden:

1. **Exenciones.** Admins y usuarios confiables no se moderan. Los bloqueados por Luxu sí.
2. **Actividad.** Ventana deslizante para flood, spam y repeticiones.
3. **Reglas locales.** Palabrotas por niveles, estafas, amenazas, enlaces, mayúsculas y texto distorsionado. No necesitan red.
4. **Contexto y API de Soclya.** Si hay sospecha, Luxu consulta la moderación de Soclya con el mensaje anterior de la sala como contexto. Tiene caché y un circuit breaker.
5. **Campañas.** Enlaces compartidos por varias cuentas y spam coordinado.
6. **Puntuación 0-100.** Baja (<35, no se actúa), media (≥35), alta (≥60), crítica (≥85).
7. **Escalera.** El peso del aviso (media 1, alta 2, crítica 3) se suma a los avisos activos. El nivel total decide la sanción:

| Nivel | Acción |
|---|---|
| 1 | Se retira el mensaje y se avisa en el chat. |
| 2 | Aviso reiterado: la siguiente infracción tendrá sanciones. |
| 3 | Aislamiento de `LUXU_TIMEOUT_MINUTES` minutos. |
| 4 | Aislamiento de 60 minutos y alerta a moderadores. |
| 5 (`LUXU_KICK_AT`) | Expulsión. |
| 7 (`LUXU_BAN_AT`) | Baneo, solo con `LUXU_AUTO_BAN=true`. Si no, alerta recomendando el baneo. |

Un caso crítico salta directamente al nivel 4. Una amenaza o una incitación a hacerse daño, al nivel de expulsión.

Cada paso queda en el caso (`/caso`), en la auditoría y, cuando procede, en la sala de alertas.

**Ejemplo de aviso en el chat (nivel 1):**
> ⚠️ @pepe, Luxu retiró un mensaje (palabrota). Es un aviso: revisa las normas de la sala.

## Vigilancia del servidor

Cada `LUXU_WATCH_INTERVAL_MS` Luxu hace una foto de los servidores donde está (nombre, descripción, salas y miembros) y la compara con la anterior. Avisa de:

- Servidor renombrado o con descripción cambiada.
- Salas creadas, eliminadas, renombradas, con tema cambiado o de otro tipo.
- **Bots añadidos** al servidor.
- **Raids**: más altas de `LUXU_RAID_JOIN_LIMIT` en un minuto.
- Luxu ya no aparece en el servidor.
- Nuevos miembros: se registran y, si configuras `LUXU_WELCOME_SALA_ID`, se les da la bienvenida.

Todo cambio queda en la auditoría y se consulta con `/vigilancia`. Lo que Luxu no puede ver está en la siguiente sección.

## Memoria

Luxu tiene dos tipos de memoria:

- **Largo plazo** (fichero `data/state.json`, persistente): historial de cada usuario (mensajes, avisos con caducidad, confianza, bloqueos y reportes), casos, palabras propias, reportes y la última foto de cada servidor. Se guarda de forma atómica y, si el fichero se corrompe, se respalda en vez de perderse.
- **Corto plazo** (solo en RAM): los últimos `LUXU_MEMORY_MESSAGES` mensajes de cada sala. Sirve para dar contexto a la moderación, para `/resumen` y para detectar actividad. **Se pierde al reiniciar.**

Luxu no guarda el historial completo de las salas: solo reacciona a los eventos en tiempo real.

## Límites de la API (lo que Luxu no puede saber)

Soclya documenta una API y un gateway concretos. Estos son sus límites, y Luxu está diseñado alrededor de ellos:

- **No hay registro de auditoría en la API.** Luxu no puede saber *quién* cambió la configuración ni *cuándo* con precisión. Solo ve el estado antes y después en su siguiente revisión.
- **No hay eventos de configuración.** El gateway envía mensajes e interacciones. Los cambios de servidor se detectan comparando fotos, así que pueden tardar hasta `LUXU_WATCH_INTERVAL_MS`.
- **No se ven roles ni permisos.** Si alguien cambia los permisos de un rol, Luxu no lo sabe.
- **La lista de miembros tiene un máximo de 200.** En servidores grandes, Luxu detecta altas, pero no salidas, y lo indica en la foto como «parcial».
- **La bandera de bot en la lista de miembros** se toma de la API si la devuelve. Si no, los bots aparecerán como miembros normales.
- **Solo se ve lo que el rol del bot permite.** Las salas ocultas no existen para Luxu.
- **Solo hay 25 comandos con barra por bot.** Luxu los usa todos.
- **El historial solo cubre los servidores donde Luxu está instalado.** Es un registro de sanciones de la propia instalación, no de toda la red de Soclya.
- **Los nombres de usuario pueden cambiar.** Si alguien se cambia el nombre, deja de ser admin por `LUXU_ADMIN_USERNAMES`. Usa ids para los admins importantes.
- **Las sanciones dependen de los permisos del bot.** Sin permiso para moderar miembros, Luxu avisa pero no puede aislar ni expulsar.

Lo que sí garantiza Luxu es que, dentro de estos límites, todo lo que hace queda registrado y se puede revisar.

## Resiliencia

- **Reconexión automática** del gateway con espera creciente (1 s, 2 s, 4 s… hasta 60 s) y watchdog de latido.
- **Reintentos seguros.** Solo se reintentan peticiones idempotentes, para no duplicar mensajes ni sanciones. Respeta `Retry-After` ante un 429.
- **Circuit breaker** en la moderación de Soclya y en la IA. Si caen, Luxu sigue con sus reglas locales.
- **Cola de salida** con ritmo máximo: todas las escrituras pasan por ella.
- **Errores aislados.** Un evento que falla se registra y no tumba el bot.
- **Apagado limpio** con `Ctrl+C`: vacía la cola y guarda el estado.

## Estructura del proyecto

```
src/
  index.js                 arranque, validación de configuración y apagado limpio
  bot.js                   composición de módulos
  config.js                lectura y validación del .env
  core/
    gateway.js             WebSocket de Soclya (latido, reconexión)
    soclyaApi.js           cliente REST de Soclya
    http.js                fetch con timeout y reintentos seguros
    outbox.js              cola de salida con ritmo máximo
    store.js               memoria de largo plazo (usuarios, avisos, casos, reportes)
    memory.js              memoria de corto plazo (últimos mensajes por sala)
    alerts.js              avisos a la sala de moderadores
    rateLimiter.js         ventana deslizante
    circuitBreaker.js      pausa ante fallos repetidos
    cache.js               caché con caducidad
    logger.js              logs JSON con redacción de secretos
  security/
    text.js                normalización y utilidades de texto
    profanity.js           palabrotas por niveles, con leet speak y letras separadas
    rules.js               reglas locales (estafas, amenazas, enlaces, mayúsculas…)
    scoring.js             puntuación y gravedad
    discipline.js          escalera de sanciones y textos para el chat
    suspicion.js           campañas de enlaces, spam coordinado y raids
    moderator.js           pipeline de moderación y ejecución de sanciones
  watch/
    watcher.js             vigilancia del servidor (fotos y diferencias)
  community/
    commands.js            enrutador de los 25 comandos, botones y menciones
    definitions.js         definición de comandos registrada en Soclya
    fun.js                 juegos (dados, ppt, ship, elige…)
    content.js             chistes, frases, cumplidos, datos, refranes, retos
    ai.js                  asistente con IA, resúmenes y respuesta de respaldo
test/                      tests unitarios y de extremo a extremo
docs/GITHUB.md             copy del repositorio y notas de versión
```

## Tests

```bash
npm test
```

Hay 75 tests:

- **Unitarios:** palabrotas por niveles, reglas, puntuación, escalera de sanciones, sospecha (campañas, spam coordinado, raids), memoria, límites, configuración y persistencia.
- **Del pipeline de moderación:** bloqueados, confiables, admins, escalera completa hasta la expulsión, amenazas, simulación y ediciones.
- **De extremo a extremo:** arranca el bot contra un servidor de Soclya simulado (HTTP + WebSocket). Comprueba moderación, palabrotas, los 25 comandos, encuestas, reportes, palabras propias, avisos manuales, vigilancia con cambios reales, caída de la API de moderación y reconexión del gateway.

## Despliegue

**Docker**

```bash
docker build -t luxu .
docker run -d --name luxu --env-file .env -v luxu-data:/app/data --restart unless-stopped luxu
```

**Servidor con systemd o pm2:** ejecuta `node src/index.js` desde la carpeta del proyecto, con `.env` presente, y deja que el gestor de procesos lo reinicie si cae. Luxu ya se recupera de cortes de red, así que el reinicio es una segunda capa.

## Contribuir y seguridad

- Cómo contribuir: [CONTRIBUTING.md](CONTRIBUTING.md).
- Código de conducta: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Vulnerabilidades: no las publiques en un issue. Sigue [SECURITY.md](SECURITY.md).
- Historial de cambios: [CHANGELOG.md](CHANGELOG.md).

## Limitaciones conocidas

- **Falsos positivos.** Las reglas de palabras no entienden el contexto. Por eso, cuando la API de Soclya está disponible, se usa como segunda opinión. Aun así, en modo estricto, algunas frases inocentes pueden marcarse. Ajusta `LUXU_PROFANITY_LEVEL` o empieza en simulación.
- **Lista finita.** Ninguna lista cubre todas las palabrotas ni todas las variantes. Añade las que falten con `/palabras`.
- **Sin acciones sin permisos.** Si el bot no tiene permiso para moderar miembros, Luxu avisa pero no sanciona.
- **Memoria de corto plazo en RAM.** Se pierde al reiniciar.

## Licencia

[MIT](LICENSE). Libre para usar, modificar y compartir.
