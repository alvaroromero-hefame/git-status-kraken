const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]

export function relativeTime(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit)
  }
  return 'ahora'
}

export const formatDate = iso => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
