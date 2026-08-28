/**
 * POC comparativo: el MISMO caso de uso que World Quake Globe (globo 3D +
 * sismos del USGS, tamano=magnitud, color=profundidad) en ArcGIS Maps SDK.
 * Existe para medir con numeros propios lo que el ADR compara:
 * bundle, DX y accesibilidad. Ver docs/adr-001-stack-de-mapa.md.
 */
import '@arcgis/core/assets/esri/themes/dark/main.css'
import EsriMap from '@arcgis/core/Map.js'
import SceneView from '@arcgis/core/views/SceneView.js'
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer.js'

const quakes = new GeoJSONLayer({
  url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson',
  copyright: 'USGS',
  // Equivalente del par de expresiones de MapLibre: aqui es un renderer
  // declarativo con visual variables.
  renderer: {
    type: 'simple',
    symbol: {
      type: 'simple-marker',
      color: '#86b6ef',
      outline: { color: 'rgba(8,11,16,0.9)', width: 1 },
    },
    visualVariables: [
      {
        type: 'size',
        field: 'mag',
        stops: [
          { value: 1, size: 4 },
          { value: 5, size: 20 },
          { value: 9, size: 60 },
        ],
      },
    ],
  },
})

const map = new EsriMap({ basemap: 'osm', layers: [quakes] })

new SceneView({
  container: 'app',
  map,
  center: [-72, -12],
  zoom: 1,
})
