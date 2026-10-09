RedVelvet Crafting PF2e 1.9.1 corrige dos fallos del taller Extendido.

- **Idioma:** el botón 🌐 dejaba Construcciones, Cultivos y Despiece en español. Ahora se traducen como Building, Farming y Scavenging.
- **Ventana sin respuesta:** al abrir el taller Extendido sin un token seleccionado aparecía la ventana, pero ningún botón funcionaba. Ahora se muestra el aviso y no se abre nada; si no hay token seleccionado se usa el personaje asignado al usuario, igual que en Core.
- `api.openExtended({actor})` acepta un actor concreto. Core no cambia.

**English:** in the Extended workshop the language toggle now also translates Building, Farming and Scavenging, and opening it without a selected token no longer shows a window with dead buttons: it falls back to your assigned character, or warns you to select a token.

Ocho pruebas locales aprobadas, comprobación de sintaxis/recursos y empaquetado reproducible. No se ha ejecutado un mundo real de Foundry v13 para esta versión.

**Compatibilidad:** Foundry v13 como mínimo y 14.999 como máximo.

Archivos: `redvelvet-crafting-pf2e.zip`, `module.json` y `SHA256SUMS.txt`. Manifiesto de instalación: `https://github.com/gmredvelvet-rgb/redvelvet-crafting-pf2e/releases/latest/download/module.json`.
