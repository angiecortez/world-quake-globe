// Captura para el README: app real, datos reales del USGS, basemap real.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4174
const BASE = `http://localhost:${PORT}/`
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let browser
try {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { const r = await fetch(BASE); if (r.ok) break } catch {}
    await sleep(300)
  }
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForSelector('tbody tr', { timeout: 30000 })
  await page.getByRole('button', { name: /Detener rotacion/ }).click()  // captura nitida
  await page.getByRole('checkbox', { name: /Densidad de poblacion/ }).check()  // coropleta encendida
  await page.waitForSelector('#country-query', { timeout: 30000 })
  // Encuadre: Sudamerica y el Cinturon de Fuego llenando el lienzo.
  await page.evaluate(() => window.__wqgMap.jumpTo({ center: [-68, -14], zoom: 1.9 }))
  await page.waitForTimeout(8000)  // teselas del basemap
  await page.screenshot({ path: 'docs/screenshot.png' })
  console.log('captura ok')
} finally {
  await browser?.close()
  server.kill()
}
