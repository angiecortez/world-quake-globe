import { useEffect, useRef } from 'react'
import { Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl'
// MapLibre v6 resuelve la URL de su worker en runtime, algo que ningun bundler
// puede detectar estaticamente. Sin esto el worker da 404 y el GeoJSONSource
// nunca llega a parsear: el mapa se ve, pero no aparece ni un sismo.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
import type { QuakeCollection } from '../types'
import type { CountryCollection } from '../data/countries'
import {
  LAYER_GLOW, LAYER_MAIN, LAYER_PULSE, LAYER_SELECTED, SOURCE_ID,
  buildFilter, buildPulseFilter, circleRadius, depthColorExpr,
  type FilterState,
} from './layers'
import { COUNTRY_SOURCE, LAYER_CHORO_FILL, LAYER_CHORO_LINE, densityColorExpr } from './choropleth'

/** Basemap oscuro de OpenFreeMap: vector tiles OSM, sin API key. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
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
  onSelect: (id: string | null) => void
  onCountrySelect: (iso3: string | null) => void
  onVisibleChange: (ids: string[]) => void
  onUserInteract: () => void
}

export function GlobeMap(props: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const readyRef = useRef(false)
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

      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: cb.current.data,
        promoteId: 'id',
      })

      // Halo difuso: da la sensacion de energia sin competir con el dato.
      map.addLayer({
        id: LAYER_GLOW,
        type: 'circle',
        source: SOURCE_ID,
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

      readyRef.current = true
      applyData(map, cb.current.data)
      applyFilter(map, cb.current.filter)
      reportVisible(map, cb.current.onVisibleChange)
    })

    // Gancho para el smoke test: permite afirmar que las capas REALMENTE
    // renderizan (queryRenderedFeatures), no solo que el DOM existe.
    ;(window as unknown as { __wqgMap?: MlMap }).__wqgMap = map

    map.on('click', LAYER_MAIN, (e: MapMouseEvent & { features?: Array<{ properties?: Record<string, unknown> }> }) => {
      const f = e.features?.[0]
      const id = f?.properties?.id
      if (typeof id === 'string') cb.current.onSelect(id)
    })
    map.on('click', (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER_MAIN] })
      if (hits.length > 0) return
      cb.current.onSelect(null)
      // Sin sismo bajo el click: si la coropleta esta activa, consulta el pais.
      if (cb.current.choropleth && map.getLayer(LAYER_CHORO_FILL)) {
        const countries = map.queryRenderedFeatures(e.point, { layers: [LAYER_CHORO_FILL] })
        const iso3 = countries[0]?.properties?.iso3
        cb.current.onCountrySelect(typeof iso3 === 'string' ? iso3 : null)
      }
    })
    map.on('mouseenter', LAYER_MAIN, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', LAYER_MAIN, () => { map.getCanvas().style.cursor = '' })

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

  // --- datos ----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyData(map, props.data)
    reportVisible(map, cb.current.onVisibleChange)
  }, [props.data])

  // --- coropleta ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !props.countries) return
    const src = map.getSource(COUNTRY_SOURCE)
    if (src && 'setData' in src) (src as GeoJSONSource).setData(props.countries)
  }, [props.countries])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const vis = props.choropleth ? 'visible' : 'none'
    for (const id of [LAYER_CHORO_FILL, LAYER_CHORO_LINE]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [props.choropleth])

  // --- filtros --------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyFilter(map, props.filter)
    reportVisible(map, cb.current.onVisibleChange)
  }, [props.filter])

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

function applyData(map: MlMap, data: QuakeCollection) {
  const src = map.getSource(SOURCE_ID)
  if (src && 'setData' in src) (src as GeoJSONSource).setData(data)
}

function applyFilter(map: MlMap, filter: FilterState) {
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
