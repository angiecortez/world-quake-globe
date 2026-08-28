const dt = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const dOnly = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatDateTime = (ms: number) => dt.format(new Date(ms))
export const formatDate = (ms: number) => dOnly.format(new Date(ms))
export const formatMag = (m: number) => `M ${m.toFixed(1)}`
export const formatDepth = (km: number) => `${Math.round(km)} km`

export function depthBand(km: number): string {
  if (km < 70) return 'superficial'
  if (km < 150) return 'intermedio'
  if (km < 300) return 'profundo'
  return 'muy profundo'
}
