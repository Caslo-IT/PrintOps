export const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '' : 'http://127.0.0.1:5000')

export function normalizePrinter(item, index) {
  const details = item.details || {}
  const progress = Number(item.progress ?? details.printProgress ?? 0)
  const nozzle = Number(item.nozzle ?? details.nozzleTemp ?? 0)
  const bed = Number(details.bedTemp0 ?? item.bed ?? 0)
  const layer = details.layer ?? 0
  const totalLayer = details.TotalLayer ?? 0

  return {
    ...item,
    name: item.name || details.hostname || `${details.model || 'Creality printer'} — ${item.ip}`,
    model: details.model || 'Creality printer',
    color: ['orange', 'blue', 'purple', 'green'][index % 4],
    progress: Number.isFinite(progress) ? progress : 0,
    nozzle: Number.isFinite(nozzle) ? nozzle : 0,
    bed: Number.isFinite(bed) ? bed : 0,
    job: details.printFileName?.split('/').pop() || item.job || 'No active job',
    eta: formatDuration(details.printLeftTime),
    layer: totalLayer ? `${layer} / ${totalLayer}` : '—',
  }
}

export function formatDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value <= 0) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function formatTemperature(value) {
  const temperature = Number(value)
  return Number.isFinite(temperature) ? `${temperature.toFixed(1)}°C` : '—'
}

export function isActiveJob(state) {
  return ['printing', 'preparing', 'paused'].includes(state)
}
