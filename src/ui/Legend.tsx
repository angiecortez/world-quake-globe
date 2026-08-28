import { DEPTH_STOPS, radiusForMag } from '../map/layers'
import { DENSITY_STOPS } from '../map/choropleth'

const MAG_SAMPLES = [3, 5, 7]

/** Doble codificacion a proposito: tamano = magnitud, color = profundidad.
 *  Ninguna de las dos variables depende solo del color (WCAG 1.4.1).
 *  La coropleta usa el tono complementario (ambar) para no pisar el canal
 *  de color de los sismos. */
export function Legend({ choropleth = false }: { choropleth?: boolean }) {
  return (
    <section className="legend" aria-labelledby="legend-title">
      <h2 id="legend-title" className="panel-title">Leyenda</h2>

      <h3 className="legend-sub" id="legend-mag">Magnitud <span className="legend-hint">(tamano)</span></h3>
      <ul className="legend-mags" aria-labelledby="legend-mag">
        {MAG_SAMPLES.map((m) => {
          const r = radiusForMag(m)
          return (
            <li key={m}>
              <span className="legend-circle" style={{ width: r * 2, height: r * 2 }} aria-hidden="true" />
              <span className="legend-label">M{m}</span>
            </li>
          )
        })}
      </ul>

      <h3 className="legend-sub" id="legend-depth">Profundidad <span className="legend-hint">(color)</span></h3>
      <ul className="legend-depths" aria-labelledby="legend-depth">
        {DEPTH_STOPS.map((s) => (
          <li key={s.at}>
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
            <span className="legend-label">{s.label}</span>
            <span className="legend-note">{s.note}</span>
          </li>
        ))}
      </ul>

      {choropleth && (
        <>
          <h3 className="legend-sub" id="legend-density">
            Densidad de poblacion <span className="legend-hint">(relleno, hab/km²)</span>
          </h3>
          <ul className="legend-depths" aria-labelledby="legend-density">
            {DENSITY_STOPS.map((s) => (
              <li key={s.at}>
                <span className="legend-swatch" style={{ background: s.color }} aria-hidden="true" />
                <span className="legend-label">{s.label}</span>
              </li>
            ))}
          </ul>
          <p className="legend-note">Los paises sin relleno no tienen dato del Banco Mundial.</p>
        </>
      )}
    </section>
  )
}
