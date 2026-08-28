/**
 * Densidad de poblacion (hab/km2) del World Bank Indicators API v2.
 * Sin key, con CORS abierto: carril "en vivo desde el browser".
 *
 * `mrnev=1` pide el valor no nulo mas reciente de cada pais, asi el join
 * no depende de que todos los paises reporten el mismo anio.
 */
const URL_DENSITY =
  'https://api.worldbank.org/v2/country/all/indicator/EN.POP.DNST?format=json&per_page=400&mrnev=1'

export interface DensityDatum {
  value: number
  year: string
}

interface RawRow {
  countryiso3code?: string
  value?: number | null
  date?: string
}

export async function fetchDensity(signal?: AbortSignal): Promise<Map<string, DensityDatum>> {
  const res = await fetch(URL_DENSITY, { signal })
  if (!res.ok) throw new Error(`El API del Banco Mundial respondio ${res.status}`)
  const raw = (await res.json()) as [unknown, RawRow[] | null]
  const rows = Array.isArray(raw) && Array.isArray(raw[1]) ? raw[1] : []

  const out = new Map<string, DensityDatum>()
  for (const r of rows) {
    if (!r.countryiso3code || typeof r.value !== 'number') continue
    out.set(r.countryiso3code, { value: r.value, year: r.date ?? '' })
  }
  if (out.size === 0) throw new Error('El Banco Mundial no devolvio datos de densidad')
  return out
}
