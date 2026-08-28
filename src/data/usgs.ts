import type { FeedOption, QuakeCollection, QuakeFeature } from '../types'

const BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary'

/** Feeds publicos del USGS: GeoJSON, sin API key, con CORS abierto. */
export const FEEDS: FeedOption[] = [
  { id: 'm45_month', label: 'M4.5+ · ultimo mes', url: `${BASE}/4.5_month.geojson`, hint: 'ligero (~400 sismos)' },
  { id: 'm25_month', label: 'M2.5+ · ultimo mes', url: `${BASE}/2.5_month.geojson`, hint: 'equilibrado (~1.500)' },
  { id: 'all_week', label: 'Todos · ultima semana', url: `${BASE}/all_week.geojson`, hint: 'denso (~2.000)' },
  { id: 'all_month', label: 'Todos · ultimo mes', url: `${BASE}/all_month.geojson`, hint: 'prueba de carga (~10.000)' },
]

interface RawFeature {
  id?: string
  geometry?: { coordinates?: number[] } | null
  properties?: {
    mag?: number | null
    place?: string | null
    time?: number | null
    url?: string | null
    tsunami?: number | null
  } | null
}

export async function fetchQuakes(url: string, signal?: AbortSignal): Promise<QuakeCollection> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`El servicio del USGS respondio ${res.status}`)
  const raw = (await res.json()) as { features?: RawFeature[] }

  const features: QuakeFeature[] = (raw.features ?? [])
    .filter((f): f is Required<Pick<RawFeature, 'id'>> & RawFeature => {
      const c = f.geometry?.coordinates
      return Boolean(f.id) && Array.isArray(c) && c.length >= 2 && typeof f.properties?.mag === 'number' && typeof f.properties?.time === 'number'
    })
    .map((f) => {
      const [lon, lat, depth] = f.geometry!.coordinates as number[]
      return {
        type: 'Feature' as const,
        id: f.id,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: {
          id: f.id,
          mag: f.properties!.mag as number,
          place: f.properties!.place ?? 'Ubicacion desconocida',
          time: f.properties!.time as number,
          depth: Math.max(0, depth ?? 0),
          url: f.properties!.url ?? '',
          tsunami: f.properties!.tsunami ?? 0,
        },
      }
    })

  features.sort((a, b) => a.properties.time - b.properties.time)
  return { type: 'FeatureCollection', features }
}
