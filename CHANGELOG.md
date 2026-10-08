# Changelog

## 1.9.0

- Modo Core: taller sencillo y nuevo modo por defecto. El jugador elige un oficio, busca el objeto en los compendios que puede ver (o lo arrastra), paga la mitad de su precio en monedas, tira Artesanía y juega el mini-juego de tres golpes.
- Ajuste de mundo "Modo de crafteo" para elegir entre Core y Extendido (el taller completo de siempre).
- Tres aciertos entregan el objeto; dos devuelven la mitad de las monedas, uno un tercio. Un error antes de la entrega devuelve las monedas.
- El tesoro (monedas, gemas, objetos de arte) y los objetos sin precio no se pueden fabricar en Core.
- API: `game.modules.get("redvelvet-crafting-pf2e").api` con `open()`, `openCore()` y `openExtended()`.
- `/craft` funciona en Foundry v14, que envía el mensaje del chat como HTML; si el taller falla al abrir, se muestra el motivo.
- Diálogo y audio heredados tomados de su ubicación v13+ en lugar de los globales obsoletos. Verificado en Foundry v14.
- Primera versión publicada en GitHub.

## 1.8.1

- Última versión distribuida antes del repositorio: taller completo con oficios, materiales, recolección, construcciones, cultivos y despiece.
