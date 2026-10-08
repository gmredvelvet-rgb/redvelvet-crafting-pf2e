# RedVelvet Crafting — PF2e

Taller de crafteo para Pathfinder 2e en Foundry VTT: el personaje tira Artesanía y un mini-juego de precisión decide el resultado. Interfaz en español e inglés.

## Modos: Core y Extendido

El GM elige el taller en **Configuración → RedVelvet Crafting → Modo de crafteo**:

- **Core (por defecto):** el taller sencillo. El jugador elige un oficio, busca el objeto en los compendios que puede ver (o lo arrastra a la ventana), paga **la mitad de su precio en monedas**, tira Artesanía contra la CD por nivel del objeto y juega el mini-juego de tres golpes. Tres aciertos entregan el objeto; dos devuelven la mitad de las monedas, uno un tercio y ninguno nada. No usa materiales ni exige competencia. El tesoro (monedas, gemas, objetos de arte) y los objetos sin precio no se pueden fabricar.
- **Extendido:** el taller completo. Cinco oficios (herrería, alquimia, joyería, piel y tela, equipo vario) con materiales propios, cuatro grados de éxito, competencia Entrenado o superior, penalización sin la dote de especialidad, recolección (Supervivencia, Atletismo, Naturaleza), construcciones, estructuras, cultivos y despiece de monstruos.

## Uso

1. Activa el módulo en un mundo PF2e.
2. Selecciona un token que controles o asigna tu personaje de usuario.
3. Escribe **`/craft`** en el chat.

Macro alternativa:

```js
game.modules.get("redvelvet-crafting-pf2e").api.open();      // el modo elegido en los ajustes
game.modules.get("redvelvet-crafting-pf2e").api.openCore();
game.modules.get("redvelvet-crafting-pf2e").api.openExtended();
```

En el mini-juego aparecen tres iconos, uno tras otro; pulsa cada uno mientras brilla en dorado. Una tirada mejor alarga el brillo.

## Diseño y sonidos

Core y Extendido comparten el diseño de la edición D&D5e: portada del taller, tarjetas ilustradas, iconos, colores y animaciones. Core incluye búsqueda con contador y limpieza, pasos de fabricación, ficha de receta y tres golpes numerados con avisos «Ahora», «Tarde», «Acierto» y «Fallo».

En los ajustes puedes activar los sonidos y elegir su volumen. Los 20 efectos locales distinguen los oficios y actividades; cada usuario controla su audio. Los botones admiten teclado, muestran el foco y respetan movimiento reducido. Las habilidades, CD por nivel, grados, competencia e inventario PF2e conservan sus reglas existentes.

## Instalación

Manifest para Foundry:

```
https://github.com/gmredvelvet-rgb/redvelvet-crafting-pf2e/releases/latest/download/module.json
```

Requiere el sistema PF2e y [Velvet License Hub](https://github.com/gmredvelvet-rgb/velvet-license-hub) 2.0.0 o superior.

## Autenticación

El módulo usa el soft gate de Patreon de la familia Velvet: todas las funciones están disponibles con licencia y sin ella; conectar Patreon solo quita el recordatorio de prueba gratuita.

## Estado de las pruebas

Ocho pruebas locales cubren Core en adaptadores v13/v14, monedas, CD por nivel, resultados, devolución, navegación y presentación compartida. Se revisaron los menús, catálogo y ficha de receta en navegador con inventario simulado. Falta la prueba en mundos reales de Foundry v13/v14 con GM y jugador conectados; véase [validación visual y funcional](docs/VISUAL-QA.md).

Para desarrollo: `npm ci`, `npm test`, `npm run check` y `npm run build`. El ZIP, manifiesto y checksums se generan en `dist`; Foundry no necesita estas dependencias de desarrollo. La versión 1.9.0 permanece como candidato en borrador hasta completar las pruebas reales.
