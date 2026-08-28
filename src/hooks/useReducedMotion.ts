import { useMediaQuery } from './useMediaQuery'

/** Fuente de verdad para toda la animacion de la app.
 *  Si el sistema pide menos movimiento: sin rotacion, sin pulso, sin vuelos. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
