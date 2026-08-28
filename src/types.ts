import type { Feature, FeatureCollection, Point } from 'geojson'

/** Propiedades normalizadas de un sismo. `depth` se sube desde la 3a
 *  coordenada del GeoJSON del USGS a properties para poder filtrar y
 *  pintar con expresiones de MapLibre (que solo leen properties). */
export interface QuakeProps {
  id: string
  mag: number
  place: string
  time: number
  depth: number
  url: string
  tsunami: number
}

export type QuakeFeature = Feature<Point, QuakeProps>
export type QuakeCollection = FeatureCollection<Point, QuakeProps>

export interface FeedOption {
  id: string
  label: string
  url: string
  hint: string
}
