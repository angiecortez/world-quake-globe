import { useEffect, useRef } from 'react'
import type { QuakeFeature } from '../types'
import { depthBand, formatDateTime, formatDepth, formatMag } from './format'

export function DetailPanel({ quake, onClose }: { quake: QuakeFeature; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)

  // El foco entra al panel al seleccionar y Escape lo devuelve a la lista.
  useEffect(() => { ref.current?.focus() }, [quake.properties.id])

  return (
    <div
      ref={ref}
      className="detail"
      tabIndex={-1}
      role="region"
      aria-label={`Detalle del sismo ${formatMag(quake.properties.mag)}`}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
    >
      <div className="detail-head">
        <p className="detail-mag">{formatMag(quake.properties.mag)}</p>
        <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar el detalle">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p className="detail-place">{quake.properties.place}</p>
      <dl className="detail-list">
        <div><dt>Fecha</dt><dd>{formatDateTime(quake.properties.time)}</dd></div>
        <div><dt>Profundidad</dt><dd>{formatDepth(quake.properties.depth)} ({depthBand(quake.properties.depth)})</dd></div>
        <div><dt>Coordenadas</dt><dd>
          {quake.geometry.coordinates[1].toFixed(3)}, {quake.geometry.coordinates[0].toFixed(3)}
        </dd></div>
        <div><dt>Tsunami</dt><dd>{quake.properties.tsunami ? 'Con aviso' : 'Sin aviso'}</dd></div>
      </dl>
      {quake.properties.url && (
        <a className="detail-link" href={quake.properties.url} target="_blank" rel="noreferrer">
          Ver ficha en USGS <span className="sr-only">(se abre en una pestana nueva)</span>
        </a>
      )}
    </div>
  )
}
