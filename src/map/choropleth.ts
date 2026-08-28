import type { ExpressionSpecification } from 'maplibre-gl'

/**
 * Rampa secuencial de UN solo tono (ambar) para densidad de poblacion.
 * Ambar a proposito: es el complementario del azul de los sismos (el par
 * azul/naranja es el mas robusto frente a daltonismo), asi las dos capas
 * nunca compiten por el mismo canal de color.
 *
 * Validada igual que la de profundidad (scripts de validacion en el repo):
 * luminosidad monotona, gaps >= 0.06 entre pasos, y el paso mas claro a
 * 12.3:1 de contraste sobre la superficie.
 *
 * Los cortes son logaritmicos porque la densidad de poblacion es una
 * distribucion muy sesgada (de <1 a >1.000 hab/km2): cortes lineales
 * dejarian el mapa entero en la primera clase.
 */
export const DENSITY_STOPS = [
  { at: 0, color: '#453413', label: 'menos de 10' },
  { at: 10, color: '#6f541d', label: '10 a 50' },
  { at: 50, color: '#9b7827', label: '50 a 150' },
  { at: 150, color: '#c99e33', label: '150 a 500' },
  { at: 500, color: '#f6c645', label: '500 o mas' },
] as const

export const COUNTRY_SOURCE = 'countries'
export const LAYER_CHORO_FILL = 'countries-fill'
export const LAYER_CHORO_LINE = 'countries-line'

/** Sin dato = sin relleno (se ve el basemap): la ausencia no se disfraza
 *  de valor bajo. La leyenda lo dice en texto. */
export const densityColorExpr: ExpressionSpecification = [
  'step', ['coalesce', ['get', 'density'], -1],
  'rgba(0,0,0,0)',
  0, DENSITY_STOPS[0].color,
  10, DENSITY_STOPS[1].color,
  50, DENSITY_STOPS[2].color,
  150, DENSITY_STOPS[3].color,
  500, DENSITY_STOPS[4].color,
] as unknown as ExpressionSpecification

export function densityBand(v: number): string {
  const stop = [...DENSITY_STOPS].reverse().find((s) => v >= s.at) ?? DENSITY_STOPS[0]
  return stop.label
}
