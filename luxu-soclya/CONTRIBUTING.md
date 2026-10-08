# Contribuir a Luxu

¡Gracias por querer mejorar Luxu! Unas reglas sencillas:

1. **Abre un issue** antes de cambios grandes, para hablar del enfoque.
2. **Haz un fork**, crea una rama (`git checkout -b feature/mi-cambio`) y trabaja ahí.
3. **Antes del PR**, ejecuta:
   ```bash
   npm run check
   npm test
   ```
4. **Añade tests.** Si tocas la moderación, incluye un caso que demuestre el comportamiento nuevo.
5. **Nada de secretos.** No subas `.env`, tokens, IDs reales de usuarios ni capturas con datos personales.
6. **Respeta los límites de Soclya.** Por ejemplo, 25 comandos por bot. Si una función necesita algo que la API no ofrece, dilo en el PR en vez de inventar el endpoint.

## Principios

- **Seguridad primero.** Ante la duda, Luxu avisa antes que sancionar. Las acciones destructivas van detrás de configuración.
- **Fallar con elegancia.** Si una dependencia externa cae, el bot sigue con lo que tiene.
- **Pocas dependencias.** Solo `ws`, `dotenv` y `pino`, a propósito.
- **Lenguaje claro.** Los mensajes al usuario y la documentación van en español, y sin insultar a nadie, ni siquiera al moderar.

## Estilo

- JavaScript de Node.js (CommonJS), con `"use strict"` en cada fichero.
- Funciones pequeñas, nombres descriptivos y sin código muerto.
- Antes de un PR, el linter no debe dar errores (`no-undef` y `no-unused-vars`).
