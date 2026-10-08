# Copy para GitHub

Textos listos para pegar en la página del repositorio, la pestaña *Releases* y las etiquetas.

## Nombre del repositorio

`luxu-soclya`

## Descripción (campo *About*, máx. 350 caracteres)

> Bot de moderación, seguridad y comunidad para Soclya. Lee el chat en tiempo real, borra palabrotas (modo estricto), avisa y escala sanciones, recuerda el historial, detecta spam, raids y campañas de enlaces, vigila cambios del servidor y trae 25 comandos. Open source, MIT.

## Sitio web (campo *Website*)

`https://soclya.com/developer`

## Temas (*Topics*)

`soclya` · `bot` · `chatbot` · `moderation` · `automod` · `spam-detection` · `community-management` · `nodejs` · `websocket` · `spanish` · `open-source`

## Presentación corta (para el README de otros sitios o redes)

> **Luxu** protege tu comunidad de Soclya: borra las palabrotas, avisa a quien se pasa de la raya y, si reincide, lo aísla o lo expulsa. Vigila el servidor, detecta raids y campañas de spam, recuerda el historial de cada miembro y añade juegos, encuestas y una IA para conversar. Es gratis, open source y se instala en minutos.

## Texto para la imagen social (*Social preview*)

Titular: **Luxu para Soclya**
Subtítulo: *Moderación estricta, comunidad divertida.*
Tres palabras clave: *Avisos · Sanciones · Memoria*

## Notas de la versión 2.1.0

**Título:** Luxu 2.1.0: memoria de chat, palabrotas estrictas y vigilancia del servidor

Luxu ya lee el chat con memoria, castiga las palabrotas y escala las sanciones según el historial de cada miembro. Además vigila los cambios visibles del servidor y detecta raids y campañas de spam.

**Lo más destacado**
- Palabrotas por niveles, en modo estricto por defecto, con palabras propias (`/palabras`).
- Avisos en el chat y una escalera de sanciones: aviso, aislamiento, expulsión y baneo opcional.
- Memoria de sala y de usuario, con resúmenes (`/resumen`) y perfiles (`/perfil`).
- Vigilancia del servidor: salas, tema, bots añadidos, altas masivas y raids.
- Reportes de usuarios (`/reportar`) y sospechosos (`/sospechosos`).
- 25 comandos, el máximo que permite Soclya.

**Importante al actualizar**
- `LUXU_STRIKE_DECAY_HOURS` se llama ahora `LUXU_WARNING_DECAY_HOURS`.
- `/chiste` y `/frase` pasan a `/divertir`. `/desbloquear` y `/desconfiar` se hacen con `activo=false`.
- Recomendación: empieza con `LUXU_ACTIONS_ENABLED=false` unos días para ajustar.

**Límites conocidos**
Soclya no ofrece registro de auditoría ni eventos de configuración, así que la vigilancia compara fotos periódicas. Ver el README, «Límites de la API».

## Etiquetas sugeridas para *Issues*

| Etiqueta | Color | Uso |
|---|---|---|
| `bug` | `#d73a4a` | Algo falla |
| `enhancement` | `#a2eeef` | Mejora o función nueva |
| `moderation` | `#fbca04` | Falsos positivos o ajustes de moderación |
| `watch` | `#0e8a16` | Vigilancia del servidor |
| `good first issue` | `#7057ff` | Para quien empieza |
| `security` | `#b60205` | Relacionado con seguridad (ver SECURITY.md) |

## Primeros issues sugeridos

1. **Ampliar el léxico** de palabrotas por región (México, Argentina, Chile…).
2. **Tests de falsos positivos**: frases inocentes que no deben marcarse.
3. **Traducción** de la documentación al inglés.
4. **Panel web** de casos y avisos (solo lectura).

## Lista de configuración del repositorio

- [ ] Sustituir `TU_USUARIO` en README, package.json y las insignias.
- [ ] Cambiar `Luxu contributors` por tu nombre en `LICENSE`.
- [ ] Activar *Secret scanning* y *Push protection* (Settings → Code security).
- [ ] Activar *Dependabot alerts* y *security updates*.
- [ ] Activar *Private vulnerability reporting* (Settings → Code security).
- [ ] Proteger la rama `main`: revisión obligatoria y CI en verde.
- [ ] Crear las etiquetas de la tabla anterior.
- [ ] Publicar la release `v2.1.0` con las notas de arriba.
- [ ] Comprobar que `.env` y `data/` no aparecen en el repositorio.
