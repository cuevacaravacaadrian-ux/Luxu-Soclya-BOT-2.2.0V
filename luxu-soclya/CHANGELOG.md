# Changelog

## 2.2.0

### Nuevo
- **Admins por nombre de usuario** (`LUXU_ADMIN_USERNAMES`). Sus comandos y su exención de moderación funcionan igual que con id.
- **`/historial usuario`** (solo owners): sanciones de una persona en todos los servidores donde Luxu está instalado. Sin mensajes, y cada consulta queda auditada.

### Cambiado
- `/caso id` se integra en `/casos [id]`. Siguen siendo 25 comandos.

## 2.1.0

### Nuevo
- **Memoria de chat.** Recuerda los últimos mensajes de cada sala (solo en RAM) y el historial de cada usuario (persistente).
- **Palabrotas por niveles** con modo estricto por defecto (`LUXU_PROFANITY_LEVEL`) y palabras propias (`/palabras`).
- **Avisos en el chat** con texto claro y sin insultar al usuario.
- **Escalera de sanciones:** aviso → aviso reiterado → aislamiento → aislamiento largo y alerta → expulsión → baneo opcional. Los avisos caducan (`LUXU_WARNING_DECAY_HOURS`).
- **Vigilancia del servidor:** salas creadas, renombradas o eliminadas, cambios de tema y tipo, bots añadidos, altas, salidas y raids.
- **Actividad sospechosa:** campañas de enlaces entre cuentas, spam coordinado y raids, con alertas que no se repiten.
- **Bienvenidas** a nuevos miembros (`LUXU_WELCOME_SALA_ID`).
- **Comandos nuevos:** `/perfil`, `/normas`, `/resumen`, `/reportar`, `/divertir`, `/advertir`, `/perdonar`, `/palabras`, `/sospechosos`, `/vigilancia`. Son 25 en total, el límite de la plataforma.
- **Bloqueo con control:** `/bloquear` y `/confiar` aceptan `activo` para activar o quitar.

### Cambiado
- `/chiste` y `/frase` pasan a `/divertir`. `/desbloquear` y `/desconfiar` se hacen con `activo=false`.
- Los avisos (*strikes*) pasan a llamarse avisos, con peso según la gravedad.
- `LUXU_STRIKE_DECAY_HOURS` pasa a `LUXU_WARNING_DECAY_HOURS`.
- La reincidencia sube por la escalera de sanciones, no inflando la puntuación de cada mensaje.

### Corregido
- Las alertas no se enfrían bien la primera vez.
- Las respuestas a menciones con error ahora informan al usuario.
- En modo simulación, las alertas a moderadores sí se envían.

## 2.0.0

- Reescritura sobre el protocolo real de Soclya: gateway, comandos con barra, interacciones y API de moderación.
- Moderación en capas con reglas locales, API de Soclya, puntuación y casos auditables.
- Comandos de comunidad, encuestas con botones y asistente con IA.
- Resiliencia: reconexión, reintentos seguros, circuit breaker y apagado limpio.
