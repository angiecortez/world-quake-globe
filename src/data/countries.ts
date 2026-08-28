import type { Feature, FeatureCollection, Geometry } from 'geojson'

/** Propiedades de un pais en la capa de coropleta. `density` se agrega
 *  en runtime al hacer el join con el Banco Mundial (las expresiones de
 *  MapLibre solo leen properties, igual que con `depth` en los sismos). */
export interface CountryProps {
  iso3: string
  name: string
  density?: number
  year?: string
}

export type CountryFeature = Feature<Geometry, CountryProps>
export type CountryCollection = FeatureCollection<Geometry, CountryProps>

/**
 * Geometrias Natural Earth 110m precomputadas por scripts/prepare-countries.mjs
 * (carril "estatico precomputado"). Van en public/ y se cargan bajo demanda:
 * quien nunca enciende la coropleta no paga sus ~170 KB.
 */
export async function fetchCountries(signal?: AbortSignal): Promise<CountryCollection> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/countries.json`, { signal })
  if (!res.ok) throw new Error(`No se pudieron cargar las geometrias (${res.status})`)
  return (await res.json()) as CountryCollection
}
