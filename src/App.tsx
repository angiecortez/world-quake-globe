import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlobeMap, type BasemapMode } from './map/GlobeMap'
import type { FilterState } from './map/layers'
import { FEEDS, fetchQuakes } from './data/usgs'
import { fetchCountries, type CountryCollection } from './data/countries'
import { fetchPlates, type PlateCollection } from './data/plates'
import { fetchDensity, type DensityDatum } from './data/worldbank'
import type { QuakeCollection, QuakeFeature } from './types'
import { Controls, WINDOW_OPTIONS } from './ui/Controls'
import { Legend } from './ui/Legend'
import { QuakeTable } from './ui/QuakeTable'
import { DetailPanel } from './ui/DetailPanel'
import { useReducedMotion } from './hooks/useReducedMotion'
import { useMediaQuery } from './hooks/useMediaQuery'
import { formatDate } from './ui/format'

const EMPTY: QuakeCollection = { type: 'FeatureCollection', features: [] }
/** Cuanto tiempo del dataset avanza por segundo de reproduccion. */
const PLAY_MS_PER_SECOND = 1000 * 60 * 60 * 18

export default function App() {
  const reducedMotion = useReducedMotion()

  // --- vista del basemap ------------------------------------------------
  // El sistema puede pedir mas contraste (prefers-contrast) y el usuario
  // puede elegir la vista a mano; la eleccion manual manda una vez tocada.
  const systemContrast = useMediaQuery('(prefers-contrast: more)')
  const [basemapChoice, setBasemapChoice] = useState<BasemapMode | null>(null)
  const basemap: BasemapMode = basemapChoice ?? (systemContrast ? 'contrast' : 'dark')

  const [feedId, setFeedId] = useState(FEEDS[0].id)
  const [data, setData] = useState<QuakeCollection>(EMPTY)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [reloadNonce, setReloadNonce] = useState(0)

  const [minMag, setMinMag] = useState(0)
  const [timeMode, setTimeMode] = useState(false)
  const [windowMs, setWindowMs] = useState(WINDOW_OPTIONS[2].ms)
  const [playhead, setPlayhead] = useState(Date.now())
  const [playing, setPlaying] = useState(false)
  const [spin, setSpin] = useState(!reducedMotion)

  // --- capa de coropleta (densidad de poblacion) -----------------------
  const [choropleth, setChoropleth] = useState(false)
  const [countriesBase, setCountriesBase] = useState<CountryCollection | null>(null)
  const [density, setDensity] = useState<Map<string, DensityDatum> | null>(null)
  const [densityStatus, setDensityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [densityRetryNonce, setDensityRetryNonce] = useState(0)
  const densityLoadedRef = useRef(false)
  const [countryQuery, setCountryQuery] = useState<string | null>(null)

  // --- capa de placas tectonicas ---------------------------------------
  const [platesOn, setPlatesOn] = useState(false)
  const [plates, setPlates] = useState<PlateCollection | null>(null)

  const [visibleIds, setVisibleIds] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => { if (reducedMotion) { setSpin(false); setPlaying(false) } }, [reducedMotion])

  // --- carga del feed ---------------------------------------------------
  useEffect(() => {
    const feed = FEEDS.find((f) => f.id === feedId)!
    const ac = new AbortController()
    setStatus('loading')
    fetchQuakes(feed.url, ac.signal)
      .then((fc) => {
        setData(fc)
        setStatus('ready')
        const times = fc.features.map((f) => f.properties.time)
        if (times.length) setPlayhead(Math.max(...times))
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
      })
    return () => ac.abort()
  }, [feedId, reloadNonce])

  // --- carga perezosa ---------------------------------------------------
  // Geometrias (estatico precomputado): las necesitan la coropleta Y el
  // modo de alto contraste. Banco Mundial (en vivo): solo la coropleta.
  // Nada de esto se carga hasta que alguien lo enciende.
  // OJO: el estado de carga NO va en las dependencias — un efecto que
  // depende del estado que el mismo setea se auto-aborta en el cleanup.
  // El guard es un ref; el reintento entra por un nonce.
  useEffect(() => {
    if (!(choropleth || basemap === 'contrast') || countriesBase) return
    const ac = new AbortController()
    fetchCountries(ac.signal)
      .then(setCountriesBase)
      .catch(() => { /* sin geometrias: la coropleta lo reporta por su via */ })
    return () => ac.abort()
  }, [choropleth, basemap, countriesBase, densityRetryNonce])

  useEffect(() => {
    if (!platesOn || plates) return
    const ac = new AbortController()
    fetchPlates(ac.signal)
      .then(setPlates)
      .catch(() => { /* sin placas: la capa simplemente no aparece */ })
    return () => ac.abort()
  }, [platesOn, plates])

  useEffect(() => {
    if (!choropleth || densityLoadedRef.current) return
    const ac = new AbortController()
    setDensityStatus('loading')
    fetchDensity(ac.signal)
      .then((dens) => {
        densityLoadedRef.current = true
        setDensity(dens)
        setDensityStatus('ready')
      })
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return
        setDensityStatus('error')
      })
    return () => ac.abort()
  }, [choropleth, densityRetryNonce])

  // El join geometria <-> indicador: `density` sube a properties para que
  // las expresiones de MapLibre puedan pintar con ella (mismo patron que
  // `depth` en los sismos).
  const countries = useMemo<CountryCollection | null>(() => {
    if (!countriesBase) return null
    if (!density) return countriesBase
    return {
      ...countriesBase,
      features: countriesBase.features.map((f) => {
        const d = density.get(f.properties.iso3)
        return d
          ? { ...f, properties: { ...f.properties, density: d.value, year: d.year } }
          : f
      }),
    }
  }, [countriesBase, density])

  const range = useMemo(() => {
    const times = data.features.map((f) => f.properties.time)
    if (!times.length) { const now = Date.now(); return { min: now - 86400000, max: now } }
    return { min: Math.min(...times), max: Math.max(...times) }
  }, [data])

  // --- reproduccion de la linea de tiempo ------------------------------
  const rafRef = useRef(0)
  useEffect(() => {
    if (!playing || !timeMode || reducedMotion) return
    let last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      setPlayhead((prev) => {
        const next = prev + (PLAY_MS_PER_SECOND * dt) / 1000
        return next > range.max ? range.min + windowMs : next
      })
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, timeMode, reducedMotion, range.max, range.min, windowMs])

  const filter: FilterState = useMemo(
    () => ({ minMag, playhead: timeMode ? playhead : null, windowMs }),
    [minMag, timeMode, playhead, windowMs],
  )

  const byId = useMemo(() => {
    const m = new Map<string, QuakeFeature>()
    for (const f of data.features) m.set(f.properties.id, f)
    return m
  }, [data])

  const visibleQuakes = useMemo(() => {
    const out: QuakeFeature[] = []
    for (const id of visibleIds) { const f = byId.get(id); if (f) out.push(f) }
    out.sort((a, b) => b.properties.time - a.properties.time)
    return out
  }, [visibleIds, byId])

  const selected = selectedId ? byId.get(selectedId) ?? null : null

  /** Desde donde se abrio el detalle, para devolver el foco ahi al cerrarlo. */
  const openOriginRef = useRef<'table' | 'map' | null>(null)

  const handleTableSelect = useCallback((id: string) => {
    openOriginRef.current = 'table'
    setSelectedId(id)
    setSpin(false)
    setFocusRequest({ id, nonce: Date.now() })
  }, [])

  const handleMapSelect = useCallback((id: string | null) => {
    if (id) openOriginRef.current = 'map'
    setSelectedId(id)
  }, [])

  // Al cerrar el detalle el foco no puede caer a <body> (WCAG 2.4.3):
  // vuelve a la fila que lo abrio (o a la tabla si esa fila ya no esta
  // en la vista), o al canvas del mapa si la seleccion vino de un click.
  const handleDetailClose = useCallback(() => {
    const origin = openOriginRef.current
    const id = selectedId
    openOriginRef.current = null
    setSelectedId(null)
    requestAnimationFrame(() => {
      if (origin === 'map') {
        document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')?.focus()
        return
      }
      const row = id
        ? document.querySelector<HTMLButtonElement>(`[data-quake-id="${CSS.escape(id)}"]`)
        : null
      ;(row ?? document.getElementById('tabla'))?.focus()
    })
  }, [selectedId])

  const handleUserInteract = useCallback(() => setSpin(false), [])

  useEffect(() => {
    if (status !== 'ready') return
    const t = window.setTimeout(() => {
      setAnnouncement(
        `${visibleQuakes.length} sismos visibles${timeMode ? ` hasta el ${formatDate(playhead)}` : ''}.`,
      )
    }, 1200)
    return () => window.clearTimeout(t)
  }, [visibleQuakes.length, timeMode, playhead, status])

  const feed = FEEDS.find((f) => f.id === feedId)!
  // "Listo" para la UI de coropleta = indicador Y geometrias presentes.
  const choroStatus = densityStatus === 'ready' && !countries ? 'loading' : densityStatus

  return (
    <div className="app">
      <a className="skip-link" href="#tabla">Saltar el mapa e ir a la lista de sismos</a>

      <header className="topbar">
        <h1>World Quake Globe</h1>
        <p className="subtitle">
          Sismicidad global · {feed.label} · datos abiertos del{' '}
          <a href="https://earthquake.usgs.gov/earthquakes/feed/" target="_blank" rel="noreferrer">USGS</a>
        </p>
      </header>

      <main className="layout">
        <div className="map-col">
          <p id="map-instructions" className="sr-only">
            Mapa interactivo. Con el foco puesto aqui, usa las flechas para desplazar el globo,
            mas y menos para acercar o alejar, y Mayus con las flechas para rotar. Cada sismo se
            dibuja como un circulo cuyo tamano indica la magnitud y cuyo color indica la profundidad.
            La misma informacion esta disponible en formato de lista despues del mapa.
          </p>

          <GlobeMap
            data={data}
            filter={filter}
            spin={spin && !reducedMotion}
            reducedMotion={reducedMotion}
            selectedId={selectedId}
            focusRequest={focusRequest}
            countries={countries}
            choropleth={choropleth}
            clustered={!!feed.cluster}
            basemap={basemap}
            plates={plates}
            platesOn={platesOn}
            onSelect={handleMapSelect}
            onCountrySelect={setCountryQuery}
            onVisibleChange={setVisibleIds}
            onUserInteract={handleUserInteract}
          />

          {status === 'loading' && <div className="overlay">Cargando sismos del USGS…</div>}
          {status === 'error' && (
            <div className="overlay overlay-error" role="alert">
              <p><strong>No se pudo cargar el feed del USGS.</strong></p>
              <p>{errorMsg}</p>
              <button type="button" className="btn" onClick={() => setReloadNonce((n) => n + 1)}>Reintentar</button>
            </div>
          )}

          {selected && <DetailPanel quake={selected} onClose={handleDetailClose} />}
        </div>

        <aside className="side" aria-label="Controles y leyenda">
          <Controls
            feedId={feedId} onFeedChange={setFeedId}
            minMag={minMag} onMinMagChange={setMinMag}
            timeMode={timeMode} onTimeModeChange={(v) => { setTimeMode(v); if (!v) setPlaying(false) }}
            windowMs={windowMs} onWindowChange={setWindowMs}
            playhead={playhead} range={range} onPlayheadChange={setPlayhead}
            playing={playing} onTogglePlay={() => setPlaying((p) => !p)}
            spin={spin} onToggleSpin={() => setSpin((s) => !s)}
            reducedMotion={reducedMotion}
            choropleth={choropleth} onChoroplethChange={setChoropleth}
            basemap={basemap} onBasemapChange={setBasemapChoice}
            platesOn={platesOn} onPlatesChange={setPlatesOn}
            densityStatus={choroStatus}
            onDensityRetry={() => setDensityRetryNonce((n) => n + 1)}
            countries={countries}
            countryQuery={countryQuery} onCountryQueryChange={setCountryQuery}
          />
          <Legend choropleth={choropleth && choroStatus === 'ready'} clustered={!!feed.cluster} plates={platesOn} />
        </aside>
      </main>

      <section id="tabla" className="table-section" tabIndex={-1}>
        <QuakeTable quakes={visibleQuakes} selectedId={selectedId} onSelect={handleTableSelect} clustered={!!feed.cluster} />
      </section>

      {/* Region viva. El anuncio va con debounce a proposito: sin el, girar el
          globo o reproducir la linea de tiempo inundaria al lector de pantalla. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>
  )
}
