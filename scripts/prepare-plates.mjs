/**
 * Precomputa los bordes de placas tectonicas (modelo PB2002 de Peter Bird,
 * via el repo abierto fraxen/tectonicplates). Mismo carril estatico que las
 * geometrias de paises: corre UNA vez y el resultado se versiona.
 *
 *   node scripts/prepare-plates.mjs
 */
import { writeFile } from 'node:fs/promises'

const SOURCE =
  'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`tectonicplates respondio ${res.status}`)
const raw = await res.json()

const round = (n) => Math.round(n * 100) / 100
const roundDeep = (c) => (typeof c === 'number' ? round(c) : c.map(roundDeep))

const features = raw.features.map((f) => ({
  type: 'Feature',
  geometry: { type: f.geometry.type, coordinates: roundDeep(f.geometry.coordinates) },
  properties: {},
}))

const fc = { type: 'FeatureCollection', features }
await writeFile('public/data/plates.json', JSON.stringify(fc))
console.log(`${features.length} bordes, ${(JSON.stringify(fc).length / 1024).toFixed(0)} KB`)
