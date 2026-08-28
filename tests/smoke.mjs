/**
 * Smoke test de navegador.
 *
 * Verifica en un Chromium real lo que el typecheck no puede ver: que las capas
 * se agreguen, que el worker de MapLibre cargue, que el GeoJSON se parsee, y
 * que el contrato de accesibilidad se cumpla (la tabla lista lo que de verdad
 * se renderiza, el foco entra al detalle, Escape lo devuelve).
 *
 * El feed del USGS y el basemap van mockeados a proposito: el test no debe
 * fallar porque un servicio de terceros este lento.
 *
 *   npm run test:smoke
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.SMOKE_PORT ?? 4173)
const BASE = `http://localhost:${PORT}/`

// ---------------------------------------------------------------- fixtures
const H = 3600000
const now = Date.now()
const PLACES = [
  ['q1', 6.2, 'Frente a la costa de Peru', [-77.5, -12.2, 35]],
  ['q2', 4.6, 'Chile central', [-71.2, -33.4, 95]],
  ['q3', 5.4, 'Oaxaca, Mexico', [-96.7, 16.2, 210]],
  ['q4', 7.1, 'Peninsula de Kamchatka', [160.3, 53.1, 12]],
  ['q5', 5.5, 'Hokkaido, Japon', [142.1, 42.9, 320]],
  ['q6', 6.0, 'Islas Tonga', [-175.2, -20.4, 180]],
]
const fixture = {
  type: 'FeatureCollection',
  features: PLACES.map(([id, mag, place, coordinates], i) => ({
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates },
    properties: { mag, place, time: now - i * 9 * H, url: `https://example.test/${id}`, tsunami: 0 },
  })),
}
const blankStyle = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#101820' } }],
}

// ------------------------------------------------------------------ helpers
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* todavia no levanta */
    }
    await sleep(300)
  }
  throw new Error(`El servidor no respondio en ${url}`)
}

// -------------------------------------------------------------------- setup
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
})
let browser

try {
  await waitForServer(BASE)

  browser = await chromium.launch({
    // Permite apuntar a un Chromium del sistema en CI o en un contenedor.
    executablePath: process.env.SMOKE_CHROMIUM || undefined,
    args: ['--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // Ruido del renderizador por software en entornos sin GPU.
    if (/WebGL|SwiftShader|GPU/i.test(m.text())) return
    consoleErrors.push(m.text())
  })

  await page.route('**://tiles.openfreemap.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(blankStyle) }))
  await page.route('**://earthquake.usgs.gov/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }))
  // Banco Mundial mockeado igual que el USGS; las geometrias de paises NO se
  // mockean: son un asset propio (public/data/countries.json) y el test debe
  // fallar si el precomputo lo rompio.
  // Glifos para las etiquetas de conteo de los clusters: un PBF vacio valido
  // (el estilo mockeado no tiene fuentes reales y el test no debe depender
  // de ellas). Registrado despues del route generico para tener prioridad.
  await page.route('**://tiles.openfreemap.org/fonts/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) }))
  // El feed denso va con su propio fixture: 60 sismos apretados alrededor de
  // Lima para que el clustering realmente forme grupos.
  const denseFixture = {
    type: 'FeatureCollection',
    features: Array.from({ length: 60 }, (_, i) => ({
      type: 'Feature',
      id: `d${i}`,
      geometry: {
        type: 'Point',
        coordinates: [-77 + (i % 8) * 0.4, -12 + Math.floor(i / 8) * 0.4, 20 + i],
      },
      properties: { mag: 2 + (i % 9) * 0.5, place: `Cerca de Lima ${i}`, time: now - i * H, url: '', tsunami: 0 },
    })),
  }
  await page.route('**://earthquake.usgs.gov/**/all_month.geojson', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(denseFixture) }))
  await page.route('**://api.worldbank.org/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ page: 1 }, [
        { countryiso3code: 'PER', value: 26.3, date: '2022' },
        { countryiso3code: 'JPN', value: 338.2, date: '2022' },
        { countryiso3code: 'CHL', value: 26.5, date: '2022' },
      ]]),
    }))

  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(5000)

  // --------------------------------------------------------------- montaje
  check('la app monta sin errores de pagina', pageErrors.length === 0, pageErrors[0])
  check('no hay errores en consola', consoleErrors.length === 0, consoleErrors[0])
  check('el titulo esta presente', (await page.locator('h1').innerText()) === 'World Quake Globe')
  check('el canvas del mapa existe', (await page.locator('canvas').count()) >= 1)

  // ------------------------------------------------- capas y datos vivos
  // Si el worker de MapLibre no carga o una capa fue rechazada, el mapa se ve
  // igual pero no se renderiza ni un sismo: esta es la asercion que lo caza.
  const rows = await page.locator('tbody tr').count()
  check('las capas renderizan sismos (la tabla se puebla)', rows > 0, `filas=${rows}`)

  // -------------------------------------------- contrato de accesibilidad
  check('existe el skip link', (await page.locator('.skip-link').count()) === 1)
  check('el mapa expone instrucciones para lector de pantalla',
    (await page.locator('#map-instructions').count()) === 1)
  check('la leyenda codifica magnitud Y profundidad',
    (await page.locator('.legend-circle').count()) === 3 &&
    (await page.locator('.legend-swatch').count()) === 4)

  const live = (await page.locator('[aria-live="polite"]').innerText()).trim()
  const announced = Number(live.match(/(\d+)/)?.[1] ?? -1)
  check('la region viva anuncia el mismo conteo que la tabla',
    announced === rows, `anunciado=${announced} tabla=${rows}`)

  // ---------------------------------------------- recorrido de teclado
  // El primer Tab de la pagina cae en el skip link, y activarlo lleva el
  // foco directo a la lista (WCAG 2.4.1): el mapa nunca es un peaje.
  await page.evaluate(() => { (document.activeElement instanceof HTMLElement) && document.activeElement.blur() })
  await page.keyboard.press('Tab')
  check('el primer Tab cae en el skip link',
    await page.evaluate(() => document.activeElement?.classList.contains('skip-link') ?? false))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  check('el skip link lleva el foco a la seccion de la lista',
    await page.evaluate(() => document.activeElement?.id === 'tabla'))

  // ------------------------------------ seleccion, foco y vuelta con Escape
  await page.locator('tbody tr .row-btn').first().click()
  await page.waitForTimeout(1000)
  check('activar una fila abre el detalle', (await page.locator('.detail').count()) === 1)
  check('el foco entra al panel de detalle',
    await page.evaluate(() => document.activeElement?.closest('.detail') !== null))

  // ------------------------------------------------- auditoria con axe-core
  // Corre con el detalle abierto (el estado con mas UI en pantalla). El canvas
  // WebGL queda como "incomplete" para color-contrast — axe no puede leerlo,
  // por eso el contraste de la rampa se valida aparte, contra el fondo real.
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
  const violations = await page.evaluate(async () => {
    const res = await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    })
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))
  })
  check('axe-core: cero violaciones WCAG 2.1 A/AA',
    violations.length === 0, JSON.stringify(violations))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  check('Escape cierra el detalle', (await page.locator('.detail').count()) === 0)
  // Regresion del foco huerfano: al cerrar, el foco vuelve a la fila que
  // abrio el detalle, no a <body> (WCAG 2.4.3).
  check('al cerrar, el foco vuelve a la fila que abrio el detalle',
    await page.evaluate(() => document.activeElement?.hasAttribute('data-quake-id') ?? false))

  // --------------------- la tabla sigue viva despues de mover el mapa
  // Regresion del bug de debounce: con el globo rotando, 'moveend' se dispara
  // sin parar y un debounce nunca alcanza a ejecutarse.
  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 320, box.y + box.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(1800)
  const rowsAfter = await page.locator('tbody tr').count()
  const liveAfter = (await page.locator('[aria-live="polite"]').innerText()).trim()
  const announcedAfter = Number(liveAfter.match(/(\d+)/)?.[1] ?? -1)
  check('la tabla se resincroniza despues de mover el mapa',
    announcedAfter === rowsAfter, `anunciado=${announcedAfter} tabla=${rowsAfter}`)

  // ------------------------------------------ controles de la linea de tiempo
  await page.locator('input[type="radio"]').nth(1).check()
  await page.waitForTimeout(600)
  check('la ventana movil habilita el boton de reproducir',
    await page.locator('.btn-play').isEnabled())
  await page.locator('.btn-play').click()
  await page.waitForTimeout(900)
  check('el boton de reproducir ofrece pausar (WCAG 2.2.2)',
    /Pausar/i.test((await page.locator('.btn-play').getAttribute('aria-label')) ?? ''))

  // ------------------------------------------------------ capa de coropleta
  await page.locator('.check-row input').check()
  await page.waitForTimeout(2500)
  // La asercion de render real (queryRenderedFeatures via el gancho de test):
  // una expresion invalida hace que MapLibre rechace la capa entera y el mapa
  // se veria perfecto sin pintar ni un pais.
  check('la coropleta renderiza paises de verdad',
    await page.evaluate(() =>
      window.__wqgMap.queryRenderedFeatures({ layers: ['countries-fill'] }).length > 0))
  check('la leyenda agrega la rampa de densidad',
    (await page.locator('#legend-density').count()) === 1)
  await page.selectOption('#country-query', 'PER')
  await page.waitForTimeout(300)
  const readout = (await page.locator('.country-readout').innerText()).trim()
  check('la consulta por teclado da el valor en texto',
    /Per(u|ú).*26\s*hab\/km/.test(readout), readout)

  // ------------------------------------------------------------- clustering
  await page.locator('input[type="radio"]').first().check()  // todo el periodo
  await page.selectOption('#feed', 'all_month')
  await page.waitForTimeout(2000)
  // El mapa quedo desplazado por las interacciones previas: encuadra el
  // fixture denso antes de preguntar que se renderiza.
  await page.evaluate(() => window.__wqgMap.jumpTo({ center: [-75.5, -10.5], zoom: 3 }))
  await page.waitForTimeout(1500)
  check('el feed denso forma grupos (clusters renderizados)',
    await page.evaluate(() =>
      window.__wqgMap.queryRenderedFeatures({ layers: ['quakes-cluster'] }).length > 0))
  check('la tabla avisa que el conjunto va agrupado',
    /agrupado/.test(await page.locator('.table-caption').innerText()))
  // La asercion de honestidad: la agregacion ocurre ANTES que los filtros de
  // capa, asi que si el filtro fuera por setFilter los clusters seguirian
  // mostrando sismos descartados. Subir la magnitud por encima del maximo
  // del fixture debe vaciar clusters Y sismos.
  await page.locator('#minmag').fill('7')
  await page.waitForTimeout(1500)
  check('los filtros atraviesan la agregacion (los clusters no mienten)',
    await page.evaluate(() =>
      window.__wqgMap.queryRenderedFeatures({ layers: ['quakes-cluster'] }).length === 0 &&
      window.__wqgMap.queryRenderedFeatures({ layers: ['quakes-main'] }).length === 0))

  check('sin errores de consola tras todas las interacciones',
    consoleErrors.length === 0, consoleErrors[0])

  await page.screenshot({ path: 'smoke.png' })
} finally {
  await browser?.close()
  server.kill()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} comprobaciones pasaron`)
if (failed.length) {
  console.error(`\nFallaron: ${failed.map((f) => f.name).join(', ')}`)
  process.exit(1)
}
console.log('Captura guardada en smoke.png')
