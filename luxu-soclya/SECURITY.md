# Política de seguridad

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad en Luxu (por ejemplo, una forma de saltarse la moderación, de ejecutar comandos de admin sin permiso, de filtrar datos o tokens, o de provocar sanciones falsas), **no la publiques en un issue**.

Repórtala de forma privada con la función **"Report a vulnerability"** de GitHub (*Security → Advisories*) en este repositorio.

Incluye, si puedes:

- una descripción del problema y su impacto,
- los pasos para reproducirlo,
- la versión de Luxu y de Node.js.

Intentaremos responder en un plazo razonable y coordinar la publicación del arreglo.

## Buenas prácticas para quien despliega Luxu

- Guarda el token en `.env` y nunca lo subas al repositorio ni lo pegues en un chat.
- Si un token se expone, **vuelve a generarlo** desde el portal de Soclya.
- Limita `LUXU_ADMIN_IDS` a personas de confianza: un admin puede moderar a mano y ver datos de otros usuarios.
- Mantén `LUXU_AUTO_BAN=false` salvo que sepas lo que haces.
- Revisa `/casos` y `/sospechosos` con regularidad, y ajusta si hay falsos positivos.
- El estado (`data/state.json`) contiene historial de usuarios. Trátalo como datos personales: no lo subas ni lo compartas.
