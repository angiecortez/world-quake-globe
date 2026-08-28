# World Quake Globe — contexto del proyecto

Documento de contexto para retomar el trabajo en cualquier sesión.
El `README.md` describe **el producto**; este archivo describe **el proceso, el
estado y las decisiones abiertas**.

---

## Por qué existe

Angie recibió los requisitos de una vacante frontend GIS:

1. Experiencia previa construyendo aplicaciones frontend GIS
2. ArcGIS Maps SDK for JavaScript, MapLibre o similares
3. Manejo de map layers, interactividad y visualización de datos
4. Conocimiento/experiencia con WCAG 2.1 AA y accesibilidad web

**Lectura de los requisitos.** Que listen "ArcGIS **o** MapLibre" sugiere que el
stack no está decidido, o que están migrando de Esri hacia open source por
costo. Y pedir WCAG 2.1 AA explícitamente sobre un mapa casi siempre significa
sector público, utility, transporte o algo regulado: los mapas son lo peor en
accesibilidad porque un canvas WebGL es una caja negra para un lector de
pantalla. Probablemente ya les rebotó una auditoría.

**El ángulo.** Angie viene de design systems (React, TypeScript, Storybook,
`@ecargo/web-components` en Thoughtworks). La intersección exacta entre lo que
ella hace y lo que a ellos les duele es *componentes de mapa accesibles*. Este
proyecto es la prueba de eso.

---

## Estado actual

- El proyecto está construido y sincronizado en `~/Desktop/GIS`.
- Typecheck y build de producción pasan.
- El smoke test pasa **15/15** en un Chromium real (verificado en esta máquina,
  28 ago 2026, con Node 22).
- El bloqueador de Node **está resuelto** (ver sección siguiente) y la app ya
  se vio **corriendo contra los datos y el basemap reales**: globo con el
  Cinturón de Fuego visible, tabla sincronizada, detalle con foco, reproducción
  temporal con pulso, y el feed completo (~11k sismos) cargando sin problema.

---

## Bloqueador RESUELTO: Node 21 vs Vite 8 (28 ago 2026)

**Resolución aplicada:** Node 22.22.2 ya estaba instalado vía nvm. Bastó con:

```bash
export PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH
rm -rf node_modules && npm ci
```

**No hizo falta borrar `package-lock.json`**: el lockfile (aunque generado en
Linux) sí incluía `@rolldown/binding-darwin-x64`; el binding faltaba solo por
el bug de npm con dependencias opcionales sobre un `node_modules` parcial.
`npm ci` limpio con Node 22 lo instala bien. Para fijarlo por defecto:
`nvm alias default 22`.

`.claude/launch.json` levanta el dev server forzando el PATH de Node 22.

---

### Contexto original del bloqueo

`npm run dev` falla con dos errores encadenados:

```
npm WARN EBADENGINE vite@8.2.2 required: ^20.19.0 || >=22.12.0, current: v21.7.3
Error: Cannot find native binding (@rolldown/binding-darwin-x64)
```

Dos causas, ambas del andamiaje inicial:

1. **Node v21.7.3 no es compatible con Vite 8.** Node 21 es una release impar
   y ya está fuera de soporte; Vite 8 y `@vitejs/plugin-react` 6 exigen
   `^20.19.0 || >=22.12.0`.
2. **El `package-lock.json` se generó en Linux**, así que npm nunca registró el
   binario nativo de rolldown para macOS Intel (`darwin-x64`). Sumado al bug
   conocido de npm con dependencias opcionales (npm/cli#4828), el resultado es
   que falta el binding.

El resto del stack sí soporta Node 21: TypeScript 7 (`>=16.20.0`), MapLibre 6
(`>=16.14.0`), Playwright (`>=20`). El único problema es Vite y su plugin.

### Opción A — subir a Node 22 LTS (recomendada)

```bash
nvm install 22 && nvm use 22
cd ~/Desktop/GIS
rm -rf node_modules package-lock.json
npm install && npm run dev
```

El proyecto queda tal cual, con stack actual. Node 21 ya no recibe parches de
seguridad, así que la deuda desaparece en vez de fijarse.

### Opción B — bajar el proyecto a Vite 5

Deja Node 21 intacto y elimina rolldown (y sus binarios nativos) por completo.
Requiere volver a verificar dos cosas antes de darla por buena: que el truco del
worker de MapLibre (`?worker&url` + `setWorkerUrl`) funcione en Vite 5, y que el
smoke test siga pasando.

**Decisión pendiente de Angie.**

---

## Qué está construido

Stack: Vite + React 19 + TypeScript + MapLibre GL JS 6. Sin backend, sin API
keys, sin dependencias de pago.

- Globo 3D (`projection: globe`) con atmósfera, sobre basemap oscuro de
  OpenFreeMap.
- Rotación automática con botón de pausa; se detiene sola ante cualquier
  interacción.
- Sismos del USGS en vivo, con selector de dataset (de ~400 a ~10.000 como
  prueba de carga).
- Ventana temporal reproducible (play/pause) + filtro de magnitud, ambos con
  `setFilter` sobre el source ya cargado: la reproducción no toca la red.
- Anillo que late sobre los sismos que acaban de entrar a la ventana.
- Tabla accesible sincronizada con lo que **realmente** se está renderizando.
- Panel de detalle con manejo de foco y cierre con Escape.

Archivos que importan: `src/map/GlobeMap.tsx` (el mapa y las animaciones),
`src/map/layers.ts` (paleta y expresiones), `src/App.tsx` (estado y
orquestación), `src/ui/QuakeTable.tsx` (el gemelo accesible),
`tests/smoke.mjs` (la verificación).

---

## Decisiones tomadas (y por qué)

| Decisión | Razón |
|---|---|
| Global, no Perú | Hay mucha más data abierta sin API key a nivel mundial, y quita el aire de "proyecto local". |
| USGS como fuente principal | Ya viene en GeoJSON, con CORS abierto y sin key: entra directo al `GeoJSONSource`. Cada feature trae `time` y `mag`, así que el time slider y el filtro son expresiones, no refetch. |
| MapLibre, no ArcGIS | Sin costo de licencia y con globo nativo desde v5. **Nota:** esto deja el flanco de Esri descubierto; ver pendientes. |
| Profundidad = rampa secuencial de un solo tono | La profundidad es una magnitud continua, no una categoría. Nada de arcoíris. Validada contra el fondo oscuro real: luminosidad monótona, gaps ≥0.06, extremo más oscuro a 3.36:1. |
| Magnitud = tamaño | Dos variables por canales distintos, así nada depende solo del color (WCAG 1.4.1). |
| Rotación apagable y `prefers-reduced-motion` | WCAG 2.2.2: toda animación que arranca sola necesita cómo detenerse. |
| Anuncios `aria-live` con debounce de 1.2s | Sin él, rotar el globo inunda al lector de pantalla. |

---

## Bugs encontrados y cómo se encontraron

Los cuatro compilaban perfecto. Ninguno lo habría detectado el typecheck: los
tres primeros salieron de correr la app en un navegador headless.

1. **`useEffect` anidado.** Un reemplazo de texto pegó un bloque dos veces y
   quedó un hook dentro del cuerpo de otro efecto. React tiraba "Invalid hook
   call" y la app no montaba. Sintácticamente válido para TypeScript.
2. **El worker de MapLibre.** v6 resuelve la URL de su worker en runtime, algo
   que ningún bundler detecta estáticamente. Daba 404, el `GeoJSONSource` nunca
   parseaba, y el resultado era un globo impecable con **cero sismos y cero
   errores en consola**. Se arregla con `?worker&url` + `setWorkerUrl()` y
   `worker: { format: 'es' }`.
3. **`["zoom"]` anidado dentro de `["*", ...]`.** MapLibre exige que `zoom` sea
   la entrada de un `interpolate`/`step` de primer nivel; si no, rechaza la capa
   completa al agregarla.
4. **El efecto que se auto-abortaba.** El fetch de la coropleta tenia su
   estado de carga en las dependencias del `useEffect`: al pasar a `loading`,
   React corria el cleanup y el `AbortController` cancelaba SU PROPIO fetch.
   Sintoma: spinner eterno, cero errores. El guard va en un ref y el reintento
   entra por un nonce. (Encontrado por el smoke test, 28 ago 2026.)
5. **Debounce en vez de throttle.** Con el globo rotando, `moveend` se dispara
   sin parar y el debounce nunca alcanzaba a ejecutarse: la tabla accesible se
   congelaba justo cuando el mapa se mueve.

El (4) es el mejor material de entrevista: es exactamente donde accesibilidad y
animación chocan, y ninguna auditoría automática lo detecta.

También se corrigió un botón "Reintentar" que era un no-op (`setFeedId(f => f)`
no dispara el efecto porque React descarta el mismo valor).

---

## Qué NO está hecho

1. ~~**Nunca se ha corrido contra datos reales.**~~ **Hecho (28 ago 2026).**
   OpenFreeMap carga, los sismos se leen bien contra el basemap real, flyTo,
   selección, ventana temporal y el feed all_month (~11k) funcionan. Hallazgo
   nuevo: al cerrar el detalle con Escape **el foco cae a `<body>`**, no vuelve
   a la fila que lo abrió (el comentario en DetailPanel dice lo contrario).
   Fix pendiente: guardar el elemento disparador y re-enfocarlo en onClose.
2. **Auditoría a11y: axe-core hecho, lector real pendiente (28 ago 2026).**
   El smoke test ahora corre axe-core (reglas WCAG 2.1 A/AA, cero violaciones),
   verifica el recorrido de teclado (skip link) y la vuelta del foco al cerrar
   el detalle — 19/19. El fix del foco huérfano ya está aplicado (origen
   tabla/mapa en `openOriginRef`, `data-quake-id` en las filas). Sigue
   pendiente: prueba manual con VoiceOver/NVDA y contraste contra teselas
   reales.
3. ~~**Una sola capa.**~~ **Hecho (28 ago 2026).** Coropleta de densidad de
   poblacion (Banco Mundial `EN.POP.DNST` en vivo + Natural Earth 110m
   precomputado en `public/data/countries.json`) con conmutador de capas,
   rampa ambar validada (`scripts/validate-ramps.mjs`), leyenda propia y via
   de teclado al dato (select de paises + `role="status"`). Carga perezosa:
   quien no la enciende no paga ni un byte.
4. **Cero ArcGIS.** Si su stack resulta ser Esri, no hay nada que mostrar. El
   POC comparativo ArcGIS SDK vs MapLibre (bundle size, costo, DX,
   accesibilidad) cubriría ese flanco y se lee muy senior.
5. **No es un repo todavía:** sin git, sin deploy, sin captura en el README. Un
   link vivo vale más que el código en una entrevista.
6. **Sin clustering** para el feed completo (~10.000 features).

Orden sugerido: (1) → (2) → (5) → (3).

---

## Fuentes de datos

| Capa | Fuente | Key |
|---|---|---|
| Sismos | `earthquake.usgs.gov/earthquakes/feed/` | no |
| Basemap | OpenFreeMap, estilo `dark` | no |
| Coropleta (pendiente) | World Bank Indicators v2 + Natural Earth | no |
| Aire (pendiente) | Open-Meteo Air Quality | no |
| Aire por estación (pendiente) | OpenAQ v3 | **sí** → edge function |

Tres carriles: en vivo desde el browser (sin key), detrás de una edge function
(con key), y estático precomputado en build time (geometrías pesadas).

---

## Comandos

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck + build de producción
npm run typecheck

npx playwright install chromium   # una sola vez
npm run test:smoke                # build + preview efímero + 15 comprobaciones
```

## Preguntas para hacerles a ellos

- ¿De dónde sale la data: feature services de ArcGIS, PostGIS, tiles propios?
- ¿El AA es por auditoría, licitación o política interna? ¿Existe el informe?
- ¿Público general o usuarios internos entrenados? Cambia todo el diseño.
- ¿Ya hay algo construido o es greenfield?
