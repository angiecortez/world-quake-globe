/**
 * Precomputa las geometrias de paises para la capa de coropleta.
 *
 * Carril de datos "estatico precomputado": esto corre UNA vez (o cuando
 * Natural Earth publique una version nueva) y el resultado se versiona en
 * public/data/countries.json — el build y el runtime no tocan la red por esto.
 *
 * Fuente: Natural Earth 110m admin-0 (dominio publico). Se recortan las
 * propiedades a { iso3, name } y las coordenadas a 2 decimales (~1.1 km,
 * de sobra para una coropleta a escala planetaria).
 *
 *   node scripts/prepare-countries.mjs
 */
import { writeFile } from 'node:fs/promises'

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`Natural Earth respondio ${res.status}`)
const raw = await res.json()

const round = (n) => Math.round(n * 100) / 100
const roundDeep = (c) => (typeof c === 'number' ? round(c) : c.map(roundDeep))

const features = raw.features
  .map((f) => {
    // NE marca algunos territorios con ISO_A3 = "-99"; ISO_A3_EH lo corrige
    // para los casos como Francia y Noruega.
    const iso3 = f.properties.ISO_A3 !== '-99' ? f.properties.ISO_A3 : f.properties.ISO_A3_EH
    return {
      type: 'Feature',
      geometry: { type: f.geometry.type, coordinates: roundDeep(f.geometry.coordinates) },
      properties: { iso3, name: f.properties.NAME_ES ?? f.properties.NAME },
    }
  })
  .filter((f) => f.properties.iso3 && f.properties.iso3 !== '-99')

const fc = { type: 'FeatureCollection', features }
await writeFile('public/data/countries.json', JSON.stringify(fc))
console.log(`${features.length} paises, ${(JSON.stringify(fc).length / 1024).toFixed(0)} KB`)
