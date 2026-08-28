import { useEffect, useRef } from 'react'
import { Map as MlMap, NavigationControl, setWorkerUrl, type FilterSpecification, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl'
import type { Point } from 'geojson'
// MapLibre v6 resuelve la URL de su worker en runtime, algo que ningun bundler
// puede detectar estaticamente. Sin esto el worker da 404 y el GeoJSONSource
// nunca llega a parsear: el mapa se ve, pero no aparece ni un sismo.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
import type { QuakeCollection } from '../types'
import type { CountryCollection } from '../data/countries'
import type { PlateCollection } from '../data/plates'
import {
  CLUSTER_COLOR, LAYER_CLUSTER, LAYER_CLUSTER_COUNT,
  LAYER_GLOW, LAYER_MAIN, LAYER_PULSE, LAYER_SELECTED, SOURCE_ID,
  buildFilter, buildPulseFilter, circleRadius, clusterRadiusExpr, depthColorExpr,
  filterFeatures, type FilterState,
} from './layers'
import { COUNTRY_SOURCE, LAYER_CHORO_FILL, LAYER_CHORO_LINE, densityColorExpr } from './choropleth'

/** Basemap oscuro de OpenFreeMap: vector tiles OSM, sin API key. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
/** Imagery Blue Marble (con relieve y batimetria) de NASA GIBS: sin key,
 *  CORS abierto, nivel maximo 8 (~600 m/px — de sobra para un globo). */
const SAT_TILES =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'

/** Las tres vistas del planeta. 'satellite' y 'contrast' apagan el basemap
 *  de teselas vectoriales y ponen lo suyo debajo de las capas de datos. */
export type BasemapMode = 'dark' | 'satellite' | 'contrast'
const SPIN_DEG_PER_SEC = 3.2
const PULSE_MS = 1000 * 60 * 60 * 12
const PULSE_PERIOD = 1800

export interface GlobeMapProps {
  data: QuakeCollection
  filter: FilterState
  spin: boolean
  reducedMotion: boolean
  selectedId: string | null
  focusRequest: { id: string; nonce: number } | null
  /** null = coropleta apagada o sin datos todavia */
  countries: CountryCollection | null
  choropleth: boolean
  /** true = feed denso: los sismos se agrupan (ver addQuakeStack) */
  clustered: boolean
  basemap: BasemapMode
  /** null = capa de placas apagada o sin datos todavia */
  plates: PlateCollection | null
  platesOn: boolean
  onSelect: (id: string | null) => void
  onCountrySelect: (iso3: string | null) => void
  onVisibleChange: (ids: string[]) => void
  onUserInteract: () => void
}

export function GlobeMap(props: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const readyRef = useRef(false)
  /** Con que modo (agrupado o no) se construyo la pila de capas actual. */
  const builtClusteredRef = useRef(false)
  /** Throttle del setData en modo cluster (re-indexar 10k por frame seria brutal). */
  const clusterThrottleRef = useRef<{ timer?: number; last: number }>({ last: 0 })
  /** Capas del basemap ocultadas por el modo de alto contraste. */
  const hiddenBaseLayersRef = useRef<string[] | null>(null)
  // Los callbacks viven en refs para que el mapa se inicialice UNA vez.
  const cb = useRef(props)
  cb.current = props

  // --- init -----------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MlMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-72, -12],
      zoom: 1.4,
      attributionControl: { compact: true },
      // El handler de teclado de MapLibre ya da flechas para desplazar
      // y +/- para zoom cuando el canvas tiene foco (WCAG 2.1.1).
      keyboard: true,
    })
    mapRef.current = map

    map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      map.setProjection({ type: 'globe' })
      map.setSky({
        'sky-color': '#0a0f1a',
        'horizon-color': '#2f5f9e',
        'fog-color': '#0a0f1a',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.55,
        'fog-ground-blend': 0.4,
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.4, 7, 0],
      })

      // La coropleta va DEBAJO de los sismos: contexto, no protagonista.
      // Sus capas existen desde el inicio (con visibilidad apagada) para que
      // encenderla sea un setLayoutProperty y no un re-armado de la pila.
      map.addSource(COUNTRY_SOURCE, {
        type: 'geojson',
        data: cb.current.countries ?? { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: LAYER_CHORO_FILL,
        type: 'fill',
        source: COUNTRY_SOURCE,
        layout: { visibility: cb.current.choropleth ? 'visible' : 'none' },
        paint: {
          'fill-color': densityColorExpr,
          // Translucida para que las etiquetas del basemap sigan legibles.
          'fill-opacity': 0.55,
        },
      })
      map.addLayer({
        id: LAYER_CHORO_LINE,
        type: 'line',
        source: COUNTRY_SOURCE,
        layout: { visibility: cb.current.choropleth ? 'visible' : 'none' },
        paint: { 'line-color': 'rgba(8,11,16,0.8)', 'line-width': 0.6 },
      })

      // Bordes de placas: contexto de peligro sismico, entre coropleta y sismos.
      map.addSource(PLATES_SOURCE, {
        type: 'geojson',
        data: cb.current.plates ?? { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: LAYER_PLATES,
        type: 'line',
        source: PLATES_SOURCE,
        layout: { visibility: cb.current.platesOn ? 'visible' : 'none' },
        paint: { 'line-color': '#e8694a', 'line-width': 1.2, 'line-opacity': 0.85 },
      })

      addQuakeStack(map, cb.current.data, cb.current.filter, cb.current.clustered)
      builtClusteredRef.current = cb.current.clustered
      applyBasemapMode(map, cb.current.basemap, cb.current.countries, hiddenBaseLayersRef)

      readyRef.current = true
      applyFilter(map, cb.current.filter, cb.current.clustered)
      reportVisible(map, cb.current.onVisibleChange)
    })

    // Gancho para el smoke test: permite afirmar que las capas REALMENTE
    // renderizan (queryRenderedFeatures), no solo que el DOM existe.
    ;(window as unknown as { __wqgMap?: MlMap }).__wqgMap = map

    // Un solo handler de click con prioridad explicita:
    // sismo individual > cluster > pais de la coropleta > vacio.
    map.on('click', (e: MapMouseEvent) => {
      if (map.getLayer(LAYER_MAIN)) {
        const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER_MAIN] })
        const id = hits[0]?.properties?.id
        if (typeof id === 'string') { cb.current.onSelect(id); return }
      }
      if (map.getLayer(LAYER_CLUSTER)) {
        const cl = map.queryRenderedFeatures(e.point, { layers: [LAYER_CLUSTER] })[0]
        if (cl) {
          const src = map.getSource(SOURCE_ID) as GeoJSONSource
          const clusterId = (cl.properties as { cluster_id: number }).cluster_id
          void src.getClusterExpansionZoom(clusterId).then((zoom) => {
            const center = (cl.geometry as Point).coordinates as [number, number]
            if (cb.current.reducedMotion) map.jumpTo({ center, zoom })
            else map.easeTo({ center, zoom, duration: 600 })
          })
          return
        }
      }
      cb.current.onSelect(null)
      // Sin sismo bajo el click: si la coropleta esta activa, consulta el pais.
      if (cb.current.choropleth && map.getLayer(LAYER_CHORO_FILL)) {
        const countries = map.queryRenderedFeatures(e.point, { layers: [LAYER_CHORO_FILL] })
        const iso3 = countries[0]?.properties?.iso3
        cb.current.onCountrySelect(typeof iso3 === 'string' ? iso3 : null)
      }
    })
    map.on('mousemove', (e: MapMouseEvent) => {
      const ids = [LAYER_MAIN, LAYER_CLUSTER].filter((id) => map.getLayer(id))
      const hover = ids.length > 0 && map.queryRenderedFeatures(e.point, { layers: ids }).length > 0
      map.getCanvas().style.cursor = hover ? 'pointer' : ''
    })

    const interact = () => cb.current.onUserInteract()
    map.on('dragstart', interact)
    map.on('wheel', interact)
    map.getCanvas().addEventListener('keydown', interact)

    // Throttle, NO debounce. Con el globo rotando, 'moveend' se dispara sin
    // parar y un debounce nunca llegaria a ejecutarse: la tabla accesible se
    // congelaria justo cuando el mapa se mueve.
    let pending: number | undefined
    let lastRun = 0
    const scheduleVisible = () => {
      const wait = Math.max(0, 500 - (performance.now() - lastRun))
      window.clearTimeout(pending)
      pending = window.setTimeout(() => {
        lastRun = performance.now()
        reportVisible(map, cb.current.onVisibleChange)
      }, wait)
    }
    map.on('moveend', scheduleVisible)
    map.on('idle', scheduleVisible)

    return () => {
      window.clearTimeout(pending)
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
  }, [])

  // --- datos (y cambio de modo agrupado/individual) --------------------
  // El flag `cluster` de un GeoJSONSource es de construccion: cambiar de
  // modo exige tirar la pila de capas de sismos y re-armarla. La coropleta
  // no se toca (esta debajo y las capas nuevas se agregan encima).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (builtClusteredRef.current !== props.clustered) {
      removeQuakeStack(map)
      addQuakeStack(map, props.data, cb.current.filter, props.clustered)
      builtClusteredRef.current = props.clustered
      applyFilter(map, cb.current.filter, props.clustered)
      setMarkStroke(map, cb.current.basemap)
    } else {
      applyData(map, props.clustered
        ? { ...props.data, features: filterFeatures(props.data.features, cb.current.filter) }
        : props.data)
    }
    reportVisible(map, cb.current.onVisibleChange)
  }, [props.data, props.clustered])

  // --- coropleta ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !props.countries) return
    const src = map.getSource(COUNTRY_SOURCE)
    if (src && 'setData' in src) (src as GeoJSONSource).setData(props.countries)
    const hc = map.getSource(HC_SOURCE)
    if (hc && 'setData' in hc) (hc as GeoJSONSource).setData(props.countries)
  }, [props.countries])

  // --- vista del basemap ----------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyBasemapMode(map, props.basemap, props.countries, hiddenBaseLayersRef)
  }, [props.basemap, props.countries])

  // --- placas tectonicas ----------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !props.plates) return
    const src = map.getSource(PLATES_SOURCE)
    if (src && 'setData' in src) (src as GeoJSONSource).setData(props.plates)
  }, [props.plates])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer(LAYER_PLATES)) return
    map.setLayoutProperty(LAYER_PLATES, 'visibility', props.platesOn ? 'visible' : 'none')
  }, [props.platesOn])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const vis = props.choropleth ? 'visible' : 'none'
    for (const id of [LAYER_CHORO_FILL, LAYER_CHORO_LINE]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [props.choropleth])

  // --- filtros --------------------------------------------------------
  // Modo normal: setFilter (gratis). Modo cluster: setData filtrado con
  // throttle de 250ms — ver el comentario en filterFeatures.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (props.clustered) {
      const t = clusterThrottleRef.current
      const run = () => {
        t.last = performance.now()
        const m = mapRef.current
        if (!m || !readyRef.current) return
        applyData(m, { ...cb.current.data, features: filterFeatures(cb.current.data.features, cb.current.filter) })
        reportVisible(m, cb.current.onVisibleChange)
      }
      window.clearTimeout(t.timer)
      t.timer = window.setTimeout(run, Math.max(0, 250 - (performance.now() - t.last)))
      return
    }
    applyFilter(map, props.filter, false)
    reportVisible(map, cb.current.onVisibleChange)
  }, [props.filter, props.clustered])

  // --- seleccion ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !map.getLayer(LAYER_SELECTED)) return
    map.setFilter(LAYER_SELECTED, ['==', ['get', 'id'], props.selectedId ?? '__none__'])
  }, [props.selectedId])

  // --- vuelo a un sismo desde la tabla --------------------------------
  useEffect(() => {
    const map = mapRef.current
    const req = props.focusRequest
    if (!map || !readyRef.current || !req) return
    const f = props.data.features.find((x) => x.properties.id === req.id)
    if (!f) return
    const center = f.geometry.coordinates as [number, number]
    const zoom = Math.max(map.getZoom(), 3.2)
    if (props.reducedMotion) map.jumpTo({ center, zoom })
    else map.flyTo({ center, zoom, duration: 1200, essential: true })
  }, [props.focusRequest])

  // --- rotacion del globo ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!props.spin || props.reducedMotion) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      const c = map.getCenter()
      c.lng = ((c.lng + (SPIN_DEG_PER_SEC * dt) / 1000 + 180) % 360) - 180
      map.setCenter(c)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [props.spin, props.reducedMotion])

  // --- pulso ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (props.reducedMotion || props.filter.playhead === null) {
      const apply = () => {
        if (map.getLayer(LAYER_PULSE)) map.setPaintProperty(LAYER_PULSE, 'circle-stroke-opacity', 0)
      }
      if (readyRef.current) apply()
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      if (readyRef.current && map.getLayer(LAYER_PULSE)) {
        const t = ((now - start) % PULSE_PERIOD) / PULSE_PERIOD
        map.setPaintProperty(LAYER_PULSE, 'circle-radius', circleRadius(1 + t * 2.4))
        map.setPaintProperty(LAYER_PULSE, 'circle-stroke-opacity', 0.85 * (1 - t))
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [props.reducedMotion, props.filter.playhead === null])

  return (
    <div
      ref={containerRef}
      className="globe"
      role="application"
      aria-label="Globo terraqueo interactivo con sismos"
      aria-describedby="map-instructions"
    />
  )
}

/**
 * Arma la pila de capas de sismos en uno de dos modos:
 *
 * - **Individual**: cada sismo es un circulo (tamano=magnitud,
 *   color=profundidad) y los filtros van por `setFilter`, gratis.
 * - **Agrupado** (feeds densos): el source clusteriza. Tres implicancias
 *   deliberadas: (1) los filtros van por `setData` filtrado, porque la
 *   agregacion ocurre ANTES que los filtros de capa y un cluster mostraria
 *   sismos ya descartados; (2) los clusters NO usan la rampa de profundidad
 *   — agregan profundidades distintas y pintarlos con una seria inventar un
 *   dato: van en neutral con el conteo encima; (3) el pulso se apaga, marca
 *   recencia individual y no tiene sentido sobre un agregado.
 */
function addQuakeStack(map: MlMap, data: QuakeCollection, filter: FilterState, clustered: boolean) {
  const noCluster = ['!', ['has', 'point_count']] as unknown as FilterSpecification

  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: clustered ? { ...data, features: filterFeatures(data.features, filter) } : data,
    promoteId: 'id',
    ...(clustered ? { cluster: true, clusterRadius: 42, clusterMaxZoom: 8 } : {}),
  })

  // Halo difuso: da la sensacion de energia sin competir con el dato.
  map.addLayer({
    id: LAYER_GLOW,
    type: 'circle',
    source: SOURCE_ID,
    ...(clustered ? { filter: noCluster } : {}),
    paint: {
      'circle-radius': circleRadius(2.4),
      'circle-color': depthColorExpr,
      'circle-opacity': 0.16,
      'circle-blur': 1,
    },
  })

  // Anillo que late sobre los sismos que acaban de entrar a la ventana.
  map.addLayer({
    id: LAYER_PULSE,
    type: 'circle',
    source: SOURCE_ID,
    layout: { visibility: clustered ? 'none' : 'visible' },
    paint: {
      'circle-radius': circleRadius(),
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#e8f2ff',
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0,
    },
  })

  // Marca principal. Tamano = magnitud, color = profundidad.
  // El anillo oscuro de 1px la despega del basemap (regla del ring de superficie).
  map.addLayer({
    id: LAYER_MAIN,
    type: 'circle',
    source: SOURCE_ID,
    ...(clustered ? { filter: noCluster } : {}),
    paint: {
      'circle-radius': circleRadius(),
      'circle-color': depthColorExpr,
      'circle-opacity': 0.9,
      'circle-stroke-color': 'rgba(8,11,16,0.9)',
      'circle-stroke-width': 1,
    },
  })

  map.addLayer({
    id: LAYER_SELECTED,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'id'], '__none__'],
    paint: {
      'circle-radius': circleRadius(1.5),
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  })

  if (clustered) {
    map.addLayer({
      id: LAYER_CLUSTER,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': CLUSTER_COLOR,
        'circle-radius': clusterRadiusExpr,
        'circle-opacity': 0.85,
        'circle-stroke-color': 'rgba(8,11,16,0.9)',
        'circle-stroke-width': 1.5,
      },
    })
    map.addLayer({
      id: LAYER_CLUSTER_COUNT,
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#e8f2ff' },
    })
  }
}

export const HC_SOURCE = 'hc-countries'
export const HC_LAYER_BG = 'hc-background'
export const HC_LAYER_LINE = 'hc-countries-line'
export const SAT_SOURCE = 'satellite'
export const SAT_LAYER = 'satellite-img'
export const PLATES_SOURCE = 'plates'
export const LAYER_PLATES = 'plates-line'

/** Capas que pertenecen a la app (datos y modos), no al basemap de teselas. */
const APP_LAYERS = new Set<string>([
  LAYER_PLATES, LAYER_CHORO_FILL, LAYER_CHORO_LINE, LAYER_GLOW, LAYER_PULSE,
  LAYER_MAIN, LAYER_SELECTED, LAYER_CLUSTER, LAYER_CLUSTER_COUNT,
  HC_LAYER_BG, HC_LAYER_LINE, SAT_LAYER,
])

/**
 * Las tres vistas del planeta, sin cambiar de estilo de teselas (eso
 * destruiria las capas propias y traeria otro fondo contra el que las rampas
 * no fueron validadas). En su lugar, el basemap vectorial se oculta y se pone
 * lo propio debajo de las capas de datos:
 *
 * - **dark**: el estilo oscuro de OpenFreeMap tal cual.
 * - **satellite**: imagery Blue Marble (relieve + batimetria) de NASA GIBS.
 *   Los marcadores cambian su anillo a blanco: sobre imagery variada el
 *   anillo oscuro no separa (WCAG 1.4.11).
 * - **contrast**: fondo negro + fronteras blancas desde geometrias propias.
 *   Las rampas, validadas contra fondo oscuro, solo mejoran.
 *
 * Siempre restaura a 'dark' primero: cada modo parte del mismo estado.
 */
function applyBasemapMode(
  map: MlMap,
  mode: BasemapMode,
  countries: CountryCollection | null,
  hiddenRef: { current: string[] | null },
) {
  // --- restaurar el estado base -----------------------------------------
  for (const id of hiddenRef.current ?? []) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
  }
  hiddenRef.current = null
  for (const id of [HC_LAYER_LINE, HC_LAYER_BG, SAT_LAYER]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  setMarkStroke(map, mode)
  if (mode === 'dark') return

  // --- ocultar el basemap de teselas ------------------------------------
  const hidden: string[] = []
  for (const layer of map.getStyle().layers) {
    if (APP_LAYERS.has(layer.id)) continue
    if (map.getLayoutProperty(layer.id, 'visibility') !== 'none') {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
      hidden.push(layer.id)
    }
  }
  hiddenRef.current = hidden
  const firstId = map.getStyle().layers[0]?.id

  if (mode === 'satellite') {
    if (!map.getSource(SAT_SOURCE)) {
      map.addSource(SAT_SOURCE, {
        type: 'raster',
        tiles: [SAT_TILES],
        tileSize: 256,
        maxzoom: 8,
        attribution: 'Imagery: NASA EOSDIS GIBS / Blue Marble',
      })
    }
    map.addLayer({ id: SAT_LAYER, type: 'raster', source: SAT_SOURCE }, firstId)
    return
  }

  // mode === 'contrast'
  if (!map.getLayer(HC_LAYER_BG)) {
    map.addLayer(
      { id: HC_LAYER_BG, type: 'background', paint: { 'background-color': '#000000' } },
      firstId,
    )
  }
  if (!map.getSource(HC_SOURCE)) {
    map.addSource(HC_SOURCE, {
      type: 'geojson',
      data: countries ?? { type: 'FeatureCollection', features: [] },
    })
  }
  if (!map.getLayer(HC_LAYER_LINE)) {
    map.addLayer(
      {
        id: HC_LAYER_LINE,
        type: 'line',
        source: HC_SOURCE,
        paint: { 'line-color': '#ffffff', 'line-width': 0.7, 'line-opacity': 0.85 },
      },
      // Encima de la coropleta (los fills lavarian las lineas) y debajo
      // de los sismos.
      map.getLayer(LAYER_GLOW) ? LAYER_GLOW : undefined,
    )
  }
}

/** Sobre imagery el anillo de separacion de las marcas es blanco;
 *  sobre fondos oscuros es oscuro (regla del ring de superficie). */
function setMarkStroke(map: MlMap, mode: BasemapMode) {
  if (!map.getLayer(LAYER_MAIN)) return
  map.setPaintProperty(
    LAYER_MAIN,
    'circle-stroke-color',
    mode === 'satellite' ? 'rgba(255,255,255,0.9)' : 'rgba(8,11,16,0.9)',
  )
}

function removeQuakeStack(map: MlMap) {
  for (const id of [LAYER_CLUSTER_COUNT, LAYER_CLUSTER, LAYER_SELECTED, LAYER_MAIN, LAYER_PULSE, LAYER_GLOW]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}

function applyData(map: MlMap, data: QuakeCollection) {
  const src = map.getSource(SOURCE_ID)
  if (src && 'setData' in src) (src as GeoJSONSource).setData(data)
}

function applyFilter(map: MlMap, filter: FilterState, clustered: boolean) {
  if (clustered) return // los filtros ya viajaron dentro del setData
  if (map.getLayer(LAYER_MAIN)) {
    const f = buildFilter(filter)
    map.setFilter(LAYER_MAIN, f)
    map.setFilter(LAYER_GLOW, f)
  }
  if (map.getLayer(LAYER_PULSE)) {
    map.setFilter(LAYER_PULSE, buildPulseFilter(filter, PULSE_MS))
  }
}

/** Lo que la tabla accesible debe listar = lo que realmente se ve en pantalla. */
function reportVisible(map: MlMap, cb: (ids: string[]) => void) {
  if (!map.getLayer(LAYER_MAIN)) return
  const feats = map.queryRenderedFeatures({ layers: [LAYER_MAIN] })
  const seen = new Set<string>()
  for (const f of feats) {
    const id = f.properties?.id
    if (typeof id === 'string') seen.add(id)
  }
  cb([...seen])
}
