# Changelog

## 1.9.0

- Talleres Core y Extendido con el mismo diseño que D&D5e: portada, tarjetas ilustradas, iconos, colores y animaciones.
- Core incorpora búsqueda con contador y limpieza, pasos de receta/preparación/fabricación y tres golpes numerados con avisos de precisión.
- 20 sonidos locales por oficio y actividad, con activación y volumen por usuario.
- Mini-juegos del taller Extendido con botones de teclado, foco visible y medición del tiempo transcurrido; se conservan fórmulas y reglas PF2e.
- Pruebas v13/v14, verificación de recursos, CI y empaquetado reproducible del candidato.

- Modo Core: taller sencillo y nuevo modo por defecto. El jugador elige un oficio, busca el objeto en los compendios que puede ver (o lo arrastra), paga la mitad de su precio en monedas, tira Artesanía y juega el mini-juego de tres golpes.
- Ajuste de mundo "Modo de crafteo" para elegir entre Core y Extendido (el taller completo de siempre).
- Tres aciertos entregan el objeto; dos devuelven la mitad de las monedas, uno un tercio. Un error antes de la entrega devuelve las monedas.
- El tesoro (monedas, gemas, objetos de arte) y los objetos sin precio no se pueden fabricar en Core.
- API: `game.modules.get("redvelvet-crafting-pf2e").api` con `open()`, `openCore()` y `openExtended()`.
- `/craft` funciona en Foundry v14, que envía el mensaje del chat como HTML; si el taller falla al abrir, se muestra el motivo.
- Diálogo y audio heredados tomados de su ubicación v13+ en lugar de los globales obsoletos. Verificado en Foundry v14.
- Compatibilidad declarada: Foundry v13 como mínimo y 14.999 como máximo (Velvet License Hub ya exigía v13).
- Primera versión publicada en GitHub.

## 1.8.1

- Última versión distribuida antes del repositorio: taller completo con oficios, materiales, recolección, construcciones, cultivos y despiece.
