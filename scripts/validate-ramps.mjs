/**
 * Validacion programatica de las dos rampas de color contra la superficie
 * oscura real de la app (#080b10):
 *
 *   1. luminosidad relativa (WCAG) estrictamente monotona,
 *   2. gap de luminosidad >= 0.05 entre pasos consecutivos (distinguibles),
 *   3. el paso de mayor contraste >= 3:1 sobre la superficie (WCAG 1.4.11).
 *
 * Sale con codigo != 0 si alguna rampa falla, asi que puede correr en CI.
 *
 *   node scripts/validate-ramps.mjs
 */
const SURFACE = '#080b10'

const RAMPS = {
  'profundidad (azul)': ['#cde2fb', '#86b6ef', '#3987e5', '#256abf'],
  'densidad (ambar)': ['#453413', '#6f541d', '#9b7827', '#c99e33', '#f6c645'],
}

const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

let failed = false
for (const [name, ramp] of Object.entries(RAMPS)) {
  const L = ramp.map(lum)
  const dir = L[1] > L[0] ? 1 : -1
  const mono = L.every((v, i) => i === 0 || (v - L[i - 1]) * dir > 0)
  const minGap = Math.min(...L.slice(1).map((v, i) => Math.abs(v - L[i])))
  const best = Math.max(...ramp.map((c) => contrast(c, SURFACE)))
  const ok = mono && minGap >= 0.05 && best >= 3
  failed ||= !ok
  console.log(
    `${ok ? '  ok  ' : ' FAIL '} ${name} — monotona: ${mono}, gap min: ${minGap.toFixed(3)}, ` +
    `mejor contraste vs superficie: ${best.toFixed(2)}:1`,
  )
}
process.exit(failed ? 1 : 0)
