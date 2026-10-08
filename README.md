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

## Instalación

Manifest para Foundry:

```
https://github.com/gmredvelvet-rgb/redvelvet-crafting-pf2e/releases/latest/download/module.json
```

Requiere el sistema PF2e y [Velvet License Hub](https://github.com/gmredvelvet-rgb/velvet-license-hub) 2.0.0 o superior.

## Autenticación

El módulo usa el soft gate de Patreon de la familia Velvet: todas las funciones están disponibles con licencia y sin ella; conectar Patreon solo quita el recordatorio de prueba gratuita.

## Estado de las pruebas

El modo Core comparte código y pruebas automatizadas con la edición D&D5e, y su flujo completo se probó en un navegador contra un Foundry simulado. Falta la prueba en un mundo real de Foundry con GM y jugador conectados.
