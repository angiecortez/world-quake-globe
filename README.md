# World Quake Globe

Visor GIS de sismicidad global sobre un globo 3D, construido con **MapLibre GL JS**
y datos abiertos del **USGS**. Sin API keys, sin backend, sin dependencias de pago.

![World Quake Globe: globo 3D oscuro centrado en Sudamerica con los sismos del
mes como circulos azules sobre los Andes y la coropleta ambar de densidad de
poblacion debajo, controles de capas, filtro y linea de tiempo, y leyenda de
magnitud y profundidad](docs/screenshot.png)

*La vista satelital: el planeta real (NASA Blue Marble) con los bordes de
placas tectonicas — los sismos caen exactamente sobre ellos.*

![La misma app en vista satelital: la Tierra real con oceanos batimetricos y
continentes en color natural, los bordes de placas tectonicas como lineas
naranjas y los sismos como circulos con anillo blanco cayendo sobre esos
bordes](docs/screenshot-satellite.png)

*Ambas capturas se regeneran con `node tests/capture.mjs` (requiere `npm run
build` previo).*

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
| Densidad de poblacion | [World Bank Indicators v2](https://datahelpdesk.worldbank.org/knowledgebase/topics/125589) (`EN.POP.DNST`, `mrnev=1`) | no | CORS abierto; valor no nulo mas reciente por pais |
| Geometrias de paises | [Natural Earth 110m](https://www.naturalearthdata.com) | no | precomputadas por `scripts/prepare-countries.mjs` a ~170 KB |
| Imagery satelital | [NASA EOSDIS GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) — Blue Marble relieve+batimetria | no | raster WMTS, CORS abierto, hasta nivel 8 |
| Placas tectonicas | [PB2002 (Peter Bird)](https://github.com/fraxen/tectonicplates) | no | precomputadas por `scripts/prepare-plates.mjs` a ~110 KB |

El feed del USGS ya viene en GeoJSON, asi que entra directo al `GeoJSONSource`
de MapLibre. La unica normalizacion en `src/data/usgs.ts` es **subir la
profundidad** desde la tercera coordenada de la geometria hacia `properties`:
las expresiones de MapLibre solo leen `properties`, y sin eso no se puede
filtrar ni pintar por profundidad.

### Los tres carriles de datos

- **En vivo desde el browser** — USGS y Banco Mundial. Fetch directo, sin
  backend, y **perezoso**: el Banco Mundial y las geometrias solo se cargan
  al encender la coropleta.
- **Con key -> edge function** — cuando se sume OpenAQ o NASA FIRMS, la key
  va del lado del servidor, nunca en el bundle.
- **Estatico precomputado** — las geometrias de paises (Natural Earth 110m)
  se recortan y cuantizan UNA vez con `scripts/prepare-countries.mjs` y se
  versionan: ni el build ni el runtime dependen de Natural Earth.

## Las tres vistas del planeta

El selector "Vista del planeta" cambia el basemap **sin cambiar de estilo de
teselas** (eso destruiria las capas propias): se ocultan las capas del basemap
vectorial y se pone lo propio debajo de los datos.

- **Oscura** — OpenFreeMap `dark`, con etiquetas. La vista por defecto, contra
  la que estan validadas las rampas.
- **Satelite** — Blue Marble de NASA GIBS (relieve + batimetria): el planeta
  real. Sobre imagery variada el anillo de las marcas pasa a blanco
  (WCAG 1.4.11). Sin key y con CORS abierto.
- **Alto contraste** — fondo negro + fronteras blancas desde las geometrias
  propias. Se activa sola con `prefers-contrast: more`.

### La capa de placas tectonicas (o: por que no "predecimos" sismos)

Paginas como las de sismos de Peru muestran "posibles sismos"; lo que hay
detras es peligro sismico, no prediccion — **los sismos no se pueden
predecir**. La respuesta honesta y global a "¿donde van a ocurrir?" es la capa
de bordes de placas (modelo PB2002): cerca del 90% de los sismos ocurre sobre
esos bordes, y al encenderla se ve a los sismos del mes calcar las lineas. La
leyenda lo dice en texto, para que el mapa no insinue algo que la sismologia
no puede prometer.

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
- **Coropleta de densidad de poblacion** (amenaza x exposicion = riesgo) en
  rampa **ambar**, el complementario del azul sismico: el par azul/naranja es
  el mas robusto frente a daltonismo, y las dos capas no compiten por el mismo
  canal. Cortes logaritmicos porque la densidad es una distribucion sesgada.
  Sin dato = sin relleno: la ausencia no se disfraza de valor bajo.
- Ambas rampas se validan con `node scripts/validate-ramps.mjs` (luminosidad
  monotona, gaps >= 0.05, contraste sobre la superficie >= 3:1), que sale con
  codigo != 0 si fallan: apto para CI.

## Detalles de experiencia

- **URL compartible**: el feed, la vista, las capas y la magnitud minima viven
  en el hash (`#feed=all_month&view=satellite&capas=placas`). Se escribe con
  `replaceState` (sin ensuciar el historial) y solo cuando difiere del default.
- **Tooltip** al pasar el puntero por un sismo o un grupo — azucar de
  exploracion; la via formal al dato sigue siendo la tabla (por eso va
  `aria-hidden`).
- **Chip de conteo** visible sobre el mapa: la version para todos de lo que la
  region `aria-live` anuncia al lector de pantalla.
- En pantallas angostas el detalle es un **bottom sheet** y la tabla scrollea
  horizontal sin partir fechas.
- Titulos en **Space Grotesk** (OFL, auto-hosteada, 22 KB); el cuerpo sigue en
  `system-ui`.
- Metadatos Open Graph con captura propia: el link se ve bien al compartirlo.

## Decisiones de accesibilidad

| Criterio WCAG 2.1 | Como se resuelve aqui |
|---|---|
| 1.1.1 Contenido no textual | El "gemelo en tabla": cada sismo renderizado existe tambien como fila navegable. El canvas nunca es la unica via al dato. |
| 1.4.1 Uso del color | Magnitud por tamano, profundidad por color, y ambos valores en texto en la tabla y el detalle. |
| 1.4.10 Reflow | A menos de 900px la barra lateral pasa debajo del mapa; los controles nunca desaparecen al hacer zoom. |
| 1.4.11 Contraste no textual | Rampa validada contra el fondo; anillo oscuro de 1px alrededor de cada marca para despegarla del basemap. |
| 2.1.1 Teclado | Handler de teclado de MapLibre activo (flechas / +- ). Toda la funcionalidad tambien esta en la tabla, que es HTML nativo. La coropleta tiene su propia via de teclado: un `select` de paises cuyo valor se lee en texto (`role="status"`). |
| 2.2.2 Pausar, detener, ocultar | La rotacion del globo y la reproduccion temporal tienen boton de pausa explicito, y se detienen solas ante cualquier interaccion del usuario. |
| 2.4.1 Evitar bloques | Skip link que salta el mapa y lleva directo a la lista. |
| 2.4.3 Orden del foco | Al seleccionar un sismo el foco entra al panel de detalle; Escape lo cierra y **devuelve el foco a la fila que lo abrio** (o al mapa, si la seleccion fue por click). |
| 2.4.7 Foco visible | Anillo de foco amarillo de 3px, elegido para sobrevivir sobre imagery oscura. |
| 4.1.3 Mensajes de estado | Region `aria-live="polite"` con el conteo de sismos visibles, **con debounce de 1.2s**: sin el, girar el globo inundaria al lector de pantalla. |
| Extra: `prefers-reduced-motion` | Apaga rotacion, pulso y vuelos; `flyTo` se degrada a `jumpTo`. |
| Extra: `forced-colors` | Los swatches de la leyenda mantienen su color; el resto adopta la paleta del sistema. |
| Extra: alto contraste | Toggle que apaga el basemap entero y lo reemplaza por fondo negro + fronteras blancas desde las geometrias propias (las rampas, validadas contra fondo oscuro, solo mejoran). Se enciende solo si el sistema pide `prefers-contrast: more`. |

## Notas de rendimiento

- El bundle de produccion pesa ~1.15 MB (~313 KB gzip); casi todo es MapLibre.
  La comparacion contra ArcGIS Maps SDK ya no es teorica: hay un POC real en
  `poc/arcgis/` y los numeros medidos (455 KB gzip / 3 requests vs ~1 MB gzip /
  ~250 requests) estan en el
  [ADR-001](docs/adr-001-stack-de-mapa.md), junto con la frontera explicita de
  cuando la decision se invertiria.
- Hasta ~2.000 features el `GeoJSONSource` plano rinde bien. El feed
  `all_month` (~10.000) **se renderiza agrupado** (`cluster: true`), con tres
  decisiones deliberadas: los filtros van por `setData` filtrado en memoria
  (la agregacion ocurre ANTES que los filtros de capa — un cluster filtrado
  por `setFilter` mostraria sismos ya descartados), los clusters van en
  neutral sin la rampa de profundidad (agregan profundidades distintas;
  pintarlos con una seria inventar un dato), y el pulso se apaga (marca
  recencia individual). Click en un grupo = zoom de expansion.
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
porque un tercero este lento) y comprueba 36 cosas en un navegador real:

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
  que debe dar cero violaciones,
- que la coropleta **renderice paises de verdad** (`queryRenderedFeatures`,
  la misma clase de asercion que caza capas rechazadas), que la leyenda sume
  la rampa de densidad, y que la consulta por pais de el valor en texto,
- que las tres vistas del planeta funcionen: alto contraste (fondo y
  fronteras propias), satelite (raster de GIBS puesto, anillo de marcas en
  blanco) y la vuelta a la oscura restaurando todo,
- que la capa de placas renderice bordes de verdad y que su leyenda diga que
  los sismos no se pueden predecir,
- que el feed denso forme grupos de verdad y que **los filtros atraviesen la
  agregacion** — subir la magnitud minima por encima del maximo debe vaciar
  clusters y sismos por igual (la asercion de que los clusters no mienten),
- que el chip de conteo visible coincida con la tabla, que el tooltip
  aparezca al pasar el puntero por un sismo, que el estado (feed, vista,
  capas, magnitud) viva en el hash de la URL y que **abrir un link
  compartido restaure ese estado**,
- y que no haya errores de consola despues de todas las interacciones.

El Banco Mundial va mockeado igual que el USGS; las geometrias **no**: son un
asset propio y el test debe fallar si el precomputo lo rompio.

Lo que este test **no** cubre: no prueba con un lector de pantalla real y no
mide contraste contra las teselas reales del basemap (axe marca el canvas WebGL
como *incomplete* para contraste; por eso la rampa se valido aparte contra el
fondo). Verifica el contrato que la app promete y las reglas automatizables de
WCAG 2.1 A/AA; la conformidad completa requiere una prueba manual con NVDA o
VoiceOver.

## Pendientes

- Capa de calidad del aire (Open-Meteo, sin key) y OpenAQ detras de una edge function.
- Prueba manual con lector de pantalla real (VoiceOver/NVDA).
