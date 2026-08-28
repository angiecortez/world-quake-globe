import type { QuakeFeature } from '../types'
import { DEPTH_STOPS } from '../map/layers'
import { formatDateTime, formatDepth, formatMag } from './format'

const MAX_ROWS = 150

function colorFor(depth: number): string {
  let c: string = DEPTH_STOPS[0].color
  for (const s of DEPTH_STOPS) if (depth >= s.at) c = s.color
  return c
}

export interface QuakeTableProps {
  quakes: QuakeFeature[]
  selectedId: string | null
  onSelect: (id: string) => void
}

/**
 * El "gemelo en tabla": el equivalente no visual de la capa del mapa.
 * Es lo que hace que un canvas WebGL deje de ser una caja negra para
 * un lector de pantalla (WCAG 1.1.1) y da una ruta de teclado a cada
 * dato sin depender de la interaccion con el mapa (2.1.1).
 */
export function QuakeTable({ quakes, selectedId, onSelect }: QuakeTableProps) {
  const rows = quakes.slice(0, MAX_ROWS)

  return (
    <section className="table-wrap" aria-labelledby="table-title">
      <h2 id="table-title" className="panel-title">
        Sismos en la vista actual
      </h2>
      <p className="table-caption" id="table-caption">
        {quakes.length === 0
          ? 'Ningun sismo coincide con los filtros en la vista actual.'
          : `${quakes.length} sismos, ordenados del mas reciente al mas antiguo.`}
        {quakes.length > MAX_ROWS && ` Se listan los primeros ${MAX_ROWS}; acerca el mapa o sube la magnitud minima para reducir la lista.`}
      </p>

      {rows.length > 0 && (
        <div className="table-scroll" tabIndex={0} role="group" aria-labelledby="table-title">
          <table aria-describedby="table-caption">
            <caption className="sr-only">Sismos visibles en el mapa</caption>
            <thead>
              <tr>
                <th scope="col">Magnitud</th>
                <th scope="col">Lugar</th>
                <th scope="col">Profundidad</th>
                <th scope="col">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const p = q.properties
                const selected = p.id === selectedId
                return (
                  <tr key={p.id} className={selected ? 'is-selected' : undefined} aria-current={selected ? 'true' : undefined}>
                    <th scope="row">
                      <button type="button" className="row-btn" data-quake-id={p.id} onClick={() => onSelect(p.id)}>
                        <span className="row-dot" style={{ background: colorFor(p.depth) }} aria-hidden="true" />
                        {formatMag(p.mag)}
                        <span className="sr-only"> — ver {p.place} en el mapa</span>
                      </button>
                    </th>
                    <td>{p.place}</td>
                    <td className="num">{formatDepth(p.depth)}</td>
                    <td className="num">{formatDateTime(p.time)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
