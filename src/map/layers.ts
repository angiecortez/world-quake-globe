import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl'

/**
 * Rampa secuencial de UN solo tono (azul) para profundidad.
 * Validada contra el basemap oscuro: luminosidad monotona, gaps >= 0.06,
 * y el extremo mas oscuro a 3.36:1 de contraste sobre la superficie.
 * Nada de arcoiris: la profundidad es una magnitud, no una categoria.
 */
export const DEPTH_STOPS = [
  { at: 0, color: '#cde2fb', label: '0-70 km', note: 'superficial' },
  { at: 70, color: '#86b6ef', label: '70-150 km', note: 'intermedio' },
  { at: 150, color: '#3987e5', label: '150-300 km', note: 'profundo' },
  { at: 300, color: '#256abf', label: '300+ km', note: 'muy profundo' },
] as const

/** Breakpoints de tamano por magnitud. La leyenda usa la MISMA funcion
 *  que el mapa, para que el circulo de referencia mida lo que dice medir. */
const MAG_BREAKS = [1, 3, 5, 7, 9]
const MAG_RADII = [2, 4.5, 10, 19, 30]

export function radiusForMag(mag: number): number {
  if (mag <= MAG_BREAKS[0]) return MAG_RADII[0]
  if (mag >= MAG_BREAKS[MAG_BREAKS.length - 1]) return MAG_RADII[MAG_RADII.length - 1]
  for (let i = 1; i < MAG_BREAKS.length; i++) {
    if (mag <= MAG_BREAKS[i]) {
      const t = (mag - MAG_BREAKS[i - 1]) / (MAG_BREAKS[i] - MAG_BREAKS[i - 1])
      return MAG_RADII[i - 1] + t * (MAG_RADII[i] - MAG_RADII[i - 1])
    }
  }
  return MAG_RADII[0]
}

const magRadiusExpr: ExpressionSpecification = [
  'interpolate', ['exponential', 1.35], ['get', 'mag'],
  ...MAG_BREAKS.flatMap((b, i) => [b, MAG_RADII[i]]),
] as ExpressionSpecification

/**
 * El globo a zoom 0 es chico: el radio se escala con el zoom para que los
 * marcadores no tapen el planeta ni desaparezcan al acercarse.
 *
 * OJO: MapLibre exige que `["zoom"]` sea la entrada de un `interpolate`/`step`
 * de PRIMER nivel. Envolverlo dentro de un `["*", ...]` hace que la capa entera
 * sea rechazada al agregarse — el mapa se ve, pero no se dibuja ni un sismo.
 */
const ZOOM_SCALE: Array<[number, number]> = [[0, 0.55], [2, 0.85], [4, 1.15], [7, 1.6]]

export function circleRadius(mult = 1): ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    ...ZOOM_SCALE.flatMap(([z, s]) => [z, ['*', magRadiusExpr, s * mult]]),
  ] as unknown as ExpressionSpecification
}

export const depthColorExpr: ExpressionSpecification = [
  'interpolate', ['linear'], ['get', 'depth'],
  ...DEPTH_STOPS.flatMap((s) => [s.at, s.color]),
] as ExpressionSpecification

export const SOURCE_ID = 'quakes'
export const LAYER_GLOW = 'quakes-glow'
export const LAYER_MAIN = 'quakes-main'
export const LAYER_PULSE = 'quakes-pulse'
export const LAYER_SELECTED = 'quakes-selected'

export interface FilterState {
  minMag: number
  /** null = mostrar todo el periodo (sin ventana temporal) */
  playhead: number | null
  windowMs: number
}

export function buildFilter({ minMag, playhead, windowMs }: FilterState): FilterSpecification {
  const clauses: unknown[] = ['all', ['>=', ['get', 'mag'], minMag]]
  if (playhead !== null) {
    clauses.push(['<=', ['get', 'time'], playhead])
    clauses.push(['>=', ['get', 'time'], playhead - windowMs])
  }
  return clauses as unknown as FilterSpecification
}

/** El pulso solo marca lo que acaba de entrar a la ventana: el "borde de ataque". */
export function buildPulseFilter(state: FilterState, pulseMs: number): FilterSpecification {
  const head = state.playhead
  if (head === null) return ['==', ['get', 'id'], '__none__'] as unknown as FilterSpecification
  return [
    'all',
    ['>=', ['get', 'mag'], state.minMag],
    ['<=', ['get', 'time'], head],
    ['>=', ['get', 'time'], head - pulseMs],
  ] as unknown as FilterSpecification
}
