import { useMemo } from 'react'
import { FEEDS } from '../data/usgs'
import type { CountryCollection } from '../data/countries'
import { densityBand } from '../map/choropleth'
import { formatDateTime } from './format'

export const WINDOW_OPTIONS = [
  { ms: 1000 * 60 * 60 * 6, label: '6 horas' },
  { ms: 1000 * 60 * 60 * 24, label: '24 horas' },
  { ms: 1000 * 60 * 60 * 72, label: '3 dias' },
  { ms: 1000 * 60 * 60 * 24 * 7, label: '7 dias' },
]

export interface ControlsProps {
  feedId: string
  onFeedChange: (id: string) => void
  minMag: number
  onMinMagChange: (v: number) => void
  timeMode: boolean
  onTimeModeChange: (v: boolean) => void
  windowMs: number
  onWindowChange: (ms: number) => void
  playhead: number
  range: { min: number; max: number }
  onPlayheadChange: (v: number) => void
  playing: boolean
  onTogglePlay: () => void
  spin: boolean
  onToggleSpin: () => void
  reducedMotion: boolean
  choropleth: boolean
  onChoroplethChange: (v: boolean) => void
  highContrast: boolean
  onHighContrastChange: (v: boolean) => void
  densityStatus: 'idle' | 'loading' | 'ready' | 'error'
  onDensityRetry: () => void
  countries: CountryCollection | null
  countryQuery: string | null
  onCountryQueryChange: (iso3: string | null) => void
}

export function Controls(p: ControlsProps) {
  const disabledTime = !p.timeMode

  const sortedCountries = useMemo(
    () => (p.countries?.features ?? [])
      .map((f) => f.properties)
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [p.countries],
  )
  const queried = p.countryQuery
    ? sortedCountries.find((c) => c.iso3 === p.countryQuery) ?? null
    : null

  return (
    <section className="controls" aria-labelledby="controls-title">
      <h2 id="controls-title" className="panel-title">Controles</h2>

      <div className="field">
        <label htmlFor="feed">Conjunto de datos</label>
        <select id="feed" value={p.feedId} onChange={(e) => p.onFeedChange(e.target.value)}>
          {FEEDS.map((f) => (
            <option key={f.id} value={f.id}>{f.label} — {f.hint}</option>
          ))}
        </select>
      </div>

      <fieldset className="field">
        <legend>Capas</legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={p.highContrast}
            onChange={(e) => p.onHighContrastChange(e.target.checked)}
          />
          Basemap de alto contraste
        </label>
        <p className="hint">
          Reemplaza el mapa base por fondo negro con fronteras blancas. Se
          activa solo si tu sistema pide mas contraste.
        </p>
        <label className="check-row">
          <input
            type="checkbox"
            checked={p.choropleth}
            onChange={(e) => p.onChoroplethChange(e.target.checked)}
          />
          Densidad de poblacion <span className="legend-hint">(Banco Mundial)</span>
        </label>
        {p.choropleth && p.densityStatus === 'loading' && (
          <p className="hint" role="status">Cargando geometrias y datos del Banco Mundial…</p>
        )}
        {p.choropleth && p.densityStatus === 'error' && (
          <p className="hint" role="alert">
            No se pudieron cargar los datos.{' '}
            <button type="button" className="btn btn-inline" onClick={p.onDensityRetry}>Reintentar</button>
          </p>
        )}
        {p.choropleth && p.densityStatus === 'ready' && (
          <div className="subfield">
            {/* La via de teclado al dato de la coropleta: el equivalente de la
                tabla de sismos, pero para paises. Nada del mapa es la unica
                ruta (WCAG 1.1.1 / 2.1.1). */}
            <label htmlFor="country-query">Consultar un pais</label>
            <select
              id="country-query"
              value={p.countryQuery ?? ''}
              onChange={(e) => p.onCountryQueryChange(e.target.value || null)}
            >
              <option value="">— elegir —</option>
              {sortedCountries.map((c) => (
                <option key={c.iso3} value={c.iso3}>{c.name}</option>
              ))}
            </select>
            <p className="country-readout" role="status">
              {queried && (typeof queried.density === 'number'
                ? `${queried.name}: ${Math.round(queried.density)} hab/km² (${densityBand(queried.density)}, dato de ${queried.year})`
                : queried ? `${queried.name}: sin dato del Banco Mundial.` : '')}
            </p>
          </div>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="minmag">
          Magnitud minima: <strong>{p.minMag.toFixed(1)}</strong>
        </label>
        <input
          id="minmag"
          type="range"
          min={0}
          max={8}
          step={0.1}
          value={p.minMag}
          onChange={(e) => p.onMinMagChange(Number(e.target.value))}
          aria-valuetext={`magnitud ${p.minMag.toFixed(1)} o mayor`}
        />
      </div>

      <fieldset className="field">
        <legend>Linea de tiempo</legend>
        <div className="radio-row">
          <label>
            <input type="radio" name="timemode" checked={!p.timeMode}
              onChange={() => p.onTimeModeChange(false)} />
            Todo el periodo
          </label>
          <label>
            <input type="radio" name="timemode" checked={p.timeMode}
              onChange={() => p.onTimeModeChange(true)} />
            Ventana movil
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="window">Tamano de ventana</label>
        <select id="window" value={p.windowMs} disabled={disabledTime}
          onChange={(e) => p.onWindowChange(Number(e.target.value))}>
          {WINDOW_OPTIONS.map((o) => <option key={o.ms} value={o.ms}>{o.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="playhead">Momento mostrado</label>
        <div className="playrow">
          {/* WCAG 2.2.2: toda animacion que arranca sola tiene como detenerla. */}
          <button type="button" className="btn btn-play" onClick={p.onTogglePlay} disabled={disabledTime}
            aria-label={p.playing ? 'Pausar la reproduccion temporal' : 'Reproducir la linea de tiempo'}>
            <span aria-hidden="true">{p.playing ? '❚❚' : '▶'}</span>
          </button>
          <input
            id="playhead"
            type="range"
            min={p.range.min}
            max={p.range.max}
            step={1000 * 60 * 30}
            value={p.playhead}
            disabled={disabledTime}
            onChange={(e) => p.onPlayheadChange(Number(e.target.value))}
            aria-valuetext={formatDateTime(p.playhead)}
          />
        </div>
        <p className="playhead-readout" aria-hidden="true">{formatDateTime(p.playhead)}</p>
      </div>

      <div className="field">
        <button type="button" className="btn btn-wide" onClick={p.onToggleSpin}
          disabled={p.reducedMotion} aria-pressed={p.spin}>
          {p.spin ? 'Detener rotacion' : 'Rotar el globo'}
        </button>
        {p.reducedMotion && (
          <p className="hint">Movimiento reducido activo en tu sistema: las animaciones estan apagadas.</p>
        )}
      </div>
    </section>
  )
}
