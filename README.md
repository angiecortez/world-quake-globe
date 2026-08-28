# World Quake Globe

Visor GIS de sismicidad global sobre un globo 3D, construido con **MapLibre GL JS**
y datos abiertos del **USGS**. Sin API keys, sin backend, sin dependencias de pago.

![World Quake Globe: globo 3D oscuro centrado en Sudamerica con los sismos del
mes como circulos azules sobre los Andes, controles de filtro y linea de tiempo,
leyenda de magnitud y profundidad, y el inicio de la tabla accesible de
sismos](docs/screenshot.png)

*La captura se regenera con `node tests/capture.mjs` (requiere `npm run build` previo).*

El proyecto existe para demostrar tres cosas a la vez:

1. manejo de *map layers*, interactividad y visualizacion de datos geoespaciales,
2. criterio de **accesibilidad WCAG 2.1 AA** aplicado al caso mas dificil que hay
   (un canvas WebGL, que para un lector de pantalla es una caja negra),
3. decisiones de arquitectura de datos defendibles.

## Correr el proyecto

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de produccion
```

### Tests

```bash
npx playwright install chromium   # una sola vez
npm run test:smoke
```

`npm run test:smoke` construye, levanta un `vite preview` efimero, corre las
comprobaciones contra un Chromium real y apaga el servidor. Sale con codigo
distinto de cero si algo falla, asi que sirve tal cual en CI.

## Datos

| Capa | Fuente | Key | Notas |
|---|---|---|---|
| Sismos | [USGS FDSN / feeds GeoJSON](https://earthquake.usgs.gov/earthquakes/feed/) | no | GeoJSON nativo, CORS abierto, actualizado cada minuto |
| Basemap | [OpenFreeMap](https://openfreemap.org) estilo `dark` | no | vector tiles OSM |

El feed del USGS ya viene en GeoJSON, asi que entra directo al `GeoJSONSource`
de MapLibre. La unica normalizacion en `src/data/usgs.ts` es **subir la
profundidad** desde la tercera coordenada de la geometria hacia `properties`:
las expresiones de MapLibre solo leen `properties`, y sin eso no se puede
filtrar ni pintar por profundidad.

### Los tres carriles de datos

- **En vivo desde el browser** — USGS. Fetch directo, sin backend.
- **Con key -> edge function** — cuando se sume OpenAQ o NASA FIRMS, la key
  va del lado del servidor, nunca en el bundle.
- **Estatico precomputado** — geometrias de paises simplificadas en build time
  (pendiente, para la capa de coropleta).

## Codificacion visual

- **Tamano = magnitud**, con interpolacion exponencial y escalado por zoom.
- **Color = profundidad**, rampa **secuencial de un solo tono** (azul claro ->
  azul oscuro). Nada de arcoiris: la profundidad es una magnitud continua, no
  una categoria.
- La rampa fue **validada programaticamente** contra el fondo oscuro real:
  luminosidad monotona, gaps de luminosidad >= 0.06 entre pasos, y el paso mas
  oscuro a **3.36:1** de contraste sobre la superficie.
- Las dos variables se codifican por canales distintos, asi que **nada depende
  solo del color** (WCAG 1.4.1).

## Decisiones de accesibilidad

| Criterio WCAG 2.1 | Como se resuelve aqui |
|---|---|
| 1.1.1 Contenido no textual | El "gemelo en tabla": cada sismo renderizado existe tambien como fila navegable. El canvas nunca es la unica via al dato. |
| 1.4.1 Uso del color | Magnitud por tamano, profundidad por color, y ambos valores en texto en la tabla y el detalle. |
| 1.4.10 Reflow | A menos de 900px la barra lateral pasa debajo del mapa; los controles nunca desaparecen al hacer zoom. |
| 1.4.11 Contraste no textual | Rampa validada contra el fondo; anillo oscuro de 1px alrededor de cada marca para despegarla del basemap. |
| 2.1.1 Teclado | Handler de teclado de MapLibre activo (flechas / +- ). Toda la funcionalidad tambien esta en la tabla, que es HTML nativo. |
| 2.2.2 Pausar, detener, ocultar | La rotacion del globo y la reproduccion temporal tienen boton de pausa explicito, y se detienen solas ante cualquier interaccion del usuario. |
| 2.4.1 Evitar bloques | Skip link que salta el mapa y lleva directo a la lista. |
| 2.4.3 Orden del foco | Al seleccionar un sismo el foco entra al panel de detalle; Escape lo cierra y **devuelve el foco a la fila que lo abrio** (o al mapa, si la seleccion fue por click). |
| 2.4.7 Foco visible | Anillo de foco amarillo de 3px, elegido para sobrevivir sobre imagery oscura. |
| 4.1.3 Mensajes de estado | Region `aria-live="polite"` con el conteo de sismos visibles, **con debounce de 1.2s**: sin el, girar el globo inundaria al lector de pantalla. |
| Extra: `prefers-reduced-motion` | Apaga rotacion, pulso y vuelos; `flyTo` se degrada a `jumpTo`. |
| Extra: `forced-colors` | Los swatches de la leyenda mantienen su color; el resto adopta la paleta del sistema. |

## Notas de rendimiento

- El bundle de produccion pesa ~1.15 MB (~313 KB gzip); casi todo es MapLibre.
  Es el numero a comparar contra el ArcGIS Maps SDK si la decision de stack
  sigue abierta.
- Hasta ~2.000 features el `GeoJSONSource` plano rinde bien. El feed
  `all_month` (~10.000) esta incluido justamente como prueba de carga: a partir
  de ahi corresponde clustering (`cluster: true`) o pasar a vector tiles.
- El filtrado temporal se hace con `setFilter` sobre el source ya cargado, no
  re-fetcheando: la reproduccion no toca la red.

## Trampas que ya estan resueltas (y por que importan)

Tres cosas que compilan perfecto y aun asi dejan el mapa vacio. Las tres
salieron de correr la app en un navegador headless, no del typecheck.

1. **El worker de MapLibre.** MapLibre v6 resuelve la URL de su worker en
   runtime (`new URL('./maplibre-gl-worker.mjs', ...)`), algo que ningun
   bundler puede detectar estaticamente. Sin intervencion el worker da 404,
   el `GeoJSONSource` nunca parsea y el resultado es un globo que se ve
   perfecto y no dibuja **ni un solo sismo**, sin un error en consola. Se
   arregla importando el worker con `?worker&url` y pasandolo a
   `setWorkerUrl()`, con `worker: { format: 'es' }` en el config.
2. **`["zoom"]` anidado.** MapLibre exige que `["zoom"]` sea la entrada de un
   `interpolate`/`step` de primer nivel. Escribir
   `["*", <expr-de-magnitud>, <expr-de-zoom>]` hace que la capa entera sea
   rechazada al agregarse. La forma correcta es zoom arriba y la expresion
   por dato en las salidas.
3. **Debounce vs. throttle en la sincronizacion de la tabla.** Con el globo
   rotando, `moveend` se dispara continuamente: un debounce nunca alcanza a
   ejecutarse y la tabla accesible se queda congelada exactamente cuando el
   mapa se mueve. Va con throttle, que garantiza una actualizacion cada 500ms.

## Verificacion

`tests/smoke.mjs` mockea el feed del USGS y el basemap (el test no debe fallar
porque un tercero este lento) y comprueba 19 cosas en un navegador real:

- que la app monte sin errores de pagina ni de consola,
- que **las capas efectivamente rendericen sismos** — la asercion que caza el
  bug del worker y el de la expresion de zoom, porque en ambos casos el mapa se
  ve perfecto y no dibuja nada,
- que la region `aria-live` anuncie **el mismo conteo** que tiene la tabla,
- que activar una fila abra el detalle y **el foco entre en el**, y que Escape
  lo cierre,
- que la tabla se resincronice despues de mover el mapa (regresion del bug de
  debounce),
- que la ventana movil habilite el boton de reproducir y que ese boton ofrezca
  pausar (WCAG 2.2.2),
- el recorrido de teclado: el primer Tab cae en el skip link y activarlo lleva
  el foco a la lista (WCAG 2.4.1),
- que al cerrar el detalle el foco **vuelva a la fila que lo abrio**, no a
  `<body>` (WCAG 2.4.3),
- una pasada de **axe-core** (reglas WCAG 2.1 A/AA) con el detalle abierto,
  que debe dar cero violaciones.

Lo que este test **no** cubre: no prueba con un lector de pantalla real y no
mide contraste contra las teselas reales del basemap (axe marca el canvas WebGL
como *incomplete* para contraste; por eso la rampa se valido aparte contra el
fondo). Verifica el contrato que la app promete y las reglas automatizables de
WCAG 2.1 A/AA; la conformidad completa requiere una prueba manual con NVDA o
VoiceOver.

## Pendientes

- Capa de coropleta por pais (World Bank Indicators + geometrias Natural Earth).
- Capa de calidad del aire (Open-Meteo, sin key) y OpenAQ detras de una edge function.
- Prueba manual con lector de pantalla real (VoiceOver/NVDA) y un modo de
  alto contraste del basemap.
- Clustering para el feed completo.
