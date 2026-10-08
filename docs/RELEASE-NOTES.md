RedVelvet Crafting PF2e 1.9.0 prepara dos talleres: Core como modo predeterminado y Extendido con los oficios y actividades existentes.

- Core y Extendido comparten el diseño de D&D5e: portada, tarjetas ilustradas, colores, iconos y animaciones.
- Core muestra catálogo con búsqueda, pasos de fabricación y tres golpes numerados con avisos de precisión.
- Se conservan Artesanía, CD por nivel, costes, inventario y reglas de competencia PF2e.
- 20 sonidos locales por oficio y actividad, con activación y volumen individual; botones de teclado y movimiento reducido.
- `/craft`, `api.open()`, `api.openCore()` y `api.openExtended()` siguen disponibles. El soft gate y la dependencia de Velvet License Hub se conservan.

Ocho pruebas locales aprobadas, comprobación de sintaxis/recursos y empaquetado reproducible. CI omite la comparación entre ediciones si D&D5e no está disponible. La revisión visual del navegador utiliza un inventario simulado.

Candidato en borrador: faltan mundos reales de Foundry v13/v14, GM y jugador, y autenticación Patreon real. Véase `docs/VISUAL-QA.md`.

Archivos: `redvelvet-crafting-pf2e.zip`, `module.json` y `SHA256SUMS.txt`. El enlace estable de instalación estará disponible tras publicar la release.
