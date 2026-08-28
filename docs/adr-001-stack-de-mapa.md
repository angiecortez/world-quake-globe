# ADR-001: MapLibre GL JS como stack de mapa (evaluado contra ArcGIS Maps SDK)

**Estado:** Aceptada
**Fecha:** 2026-08-28
**Decide:** Angie Cortez Tay

## Contexto

World Quake Globe necesita un globo 3D con sismos del USGS en vivo, una capa
de coropleta, filtros interactivos y conformidad WCAG 2.1 AA, con costo de
operacion cero (datos abiertos, sin backend, hosting estatico en GitHub
Pages). Los dos candidatos serios del requisito original son **ArcGIS Maps
SDK for JavaScript** y **MapLibre GL JS**.

Para que la comparacion no fuera de folleto, este repo incluye un POC real
(`poc/arcgis/`) que implementa el mismo nucleo — globo + sismos del USGS con
tamano por magnitud — en ArcGIS Maps SDK 4.34. Los numeros de abajo salen de
builds propios, no de documentacion.

## Decision

MapLibre GL JS (v6) para este proyecto. La frontera de decision — cuando
ArcGIS seria la respuesta correcta — queda explicita al final.

## Opciones consideradas

### Opcion A: MapLibre GL JS 6

| Dimension | Evaluacion |
|-----------|------------|
| Peso inicial (medido) | **~455 KB gzip en 3 requests** (bundle 313 KB + worker 129 KB + CSS 13 KB) |
| Build (medido) | 1.16 MB de JS, 1 chunk + 1 worker |
| Licencia / costo | BSD-3. $0 con basemap OpenFreeMap y datos abiertos |
| Globo | Nativo desde v5 (`projection: globe`), sin terreno 3D real |
| DX | Expresiones (poderosas, crípticas); TypeScript de fábrica; trampas reales documentadas en el README (worker con `?worker&url`, `["zoom"]` de primer nivel) |
| Accesibilidad | Handler de teclado básico; todo lo demás (tabla gemela, foco, aria-live) es trabajo propio fuera del canvas |
| Clustering | `cluster: true` en el source + capas manuales; la agregación ignora filtros de capa (resuelto aquí vía `setData` filtrado) |

**Pros:** peso, costo cero, control total del render, sin dependencia de un
proveedor, comunidad OSS activa (fork mantenido de Mapbox GL 1.x).
**Contras:** todo lo que no es render es trabajo propio (widgets, geocoding,
edición); las trampas del worker y de expresiones consumen tiempo real.

### Opcion B: ArcGIS Maps SDK for JavaScript 4.34

| Dimension | Evaluacion |
|-----------|------------|
| Peso inicial (medido en el POC) | **~1.0 MB gzip en ~250 requests** solo de SDK al abrir un `SceneView` mínimo (module loading en cascada; exige HTTP/2) |
| Build (medido) | 19 MB / 1.107 chunks JS (carga on-demand, no todo viaja) |
| Licencia / costo | SDK gratuito con cuenta; los servicios de Esri (basemaps vectoriales, geocoding, routing, feature services) facturan por consumo pasado el tier gratuito. Con basemap OSM y datos propios puede operar sin costo, pero el camino natural del ecosistema pasa por servicios facturables |
| Globo | `SceneView` es 3D real: terreno, cámara, oclusión — más capaz que el globo de MapLibre |
| DX | Renderers declarativos con visual variables (más legibles que las expresiones, menos componibles); worker story resuelta internamente — el bug del worker que este proyecto documenta **no existe** en ArcGIS; assets desde CDN por defecto |
| Accesibilidad | Widgets (popup, controles) con teclado y ARIA de fábrica; el canvas sigue siendo caja negra: el patrón de la tabla gemela haría falta igual |
| Clustering | `featureReduction` declarativo, con popups agregados incluidos |

**Pros:** 3D real, widgets enterprise listos, integración nativa con feature
services / ArcGIS Online / editores, soporte comercial.
**Contras:** peso inicial ~2.2x, cascada de cientos de requests, acoplamiento
al ecosistema y a su modelo de facturación, menos control fino del render.

## Analisis de trade-offs

- **Peso y arranque.** 455 KB / 3 requests vs 1.008 KB / 250 requests. Para
  una pagina publica con presupuesto de rendimiento, MapLibre gana sin
  discusion. Para una app interna detras de login, la diferencia importa poco.
- **Costo.** La exigencia de este proyecto era $0 verificable. MapLibre +
  OpenFreeMap + USGS + Banco Mundial lo cumplen. En ArcGIS es *posible*
  operar gratis, pero es nadar contra la corriente del ecosistema.
- **Accesibilidad.** Empate estructural: en ambos el canvas WebGL es opaco y
  la conformidad AA se gana fuera de el. Los widgets de Esri ayudan en los
  controles; la tabla gemela — el nucleo del enfoque de este proyecto — es
  portable tal cual entre ambos stacks.
- **Capacidad 3D.** Si el requisito fuera terreno, edificios o analisis 3D,
  `SceneView` es objetivamente superior y esta ADR se invertiria.

## Consecuencias

- Se acepta escribir a mano lo que Esri regala (widgets, popups agregados).
- Se acepta el mantenimiento de las trampas documentadas (worker, expresiones).
- El costo de cambiar de opinion es acotado: la arquitectura de datos
  (GeoJSON + join en properties) y el patron de accesibilidad no dependen
  del motor de render.

## Cuando esta decision se invierte

ArcGIS seria la eleccion correcta si: (1) la organizacion ya vive en el
ecosistema Esri — feature services, ArcGIS Online/Enterprise, flujos de
edicion; (2) hace falta 3D real (terreno, edificios); (3) se paga por soporte
comercial y widgets enterprise en vez de por horas de desarrollo propio.

## Reproducir los numeros

```bash
# MapLibre (raiz del repo)
npm run build            # dist/: bundle + worker; gzip del worker: gzip -c dist/assets/maplibre-gl-worker-*.js | wc -c

# ArcGIS (POC)
cd poc/arcgis && npm install && npm run build   # du -sh dist; find dist -name '*.js' | wc -l
npm run dev              # abrir y sumar transferSize de performance.getEntriesByType('resource')
```
