import type { FeatureCollection, Geometry } from 'geojson'

export type PlateCollection = FeatureCollection<Geometry, Record<string, never>>

/**
 * Bordes de placas tectonicas (PB2002, Peter Bird) precomputados por
 * scripts/prepare-plates.mjs. Carga perezosa, igual que los paises.
 *
 * La capa existe como respuesta honesta a "¿donde van a ocurrir sismos?":
 * los sismos NO se pueden predecir, pero ~90% ocurre sobre estos bordes.
 */
export async function fetchPlates(signal?: AbortSignal): Promise<PlateCollection> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/plates.json`, { signal })
  if (!res.ok) throw new Error(`No se pudieron cargar las placas (${res.status})`)
  return (await res.json()) as PlateCollection
}
