import { FEEDS } from '../data/usgs'
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
}

export function Controls(p: ControlsProps) {
  const disabledTime = !p.timeMode

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
