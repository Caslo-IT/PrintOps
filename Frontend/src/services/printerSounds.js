const KEY = 'printops.printerSounds'
const defaults = { enabled: true, start: true, complete: true, error: true, volume: 50 }
let context
let nextToneAt = 0
let preferences

export function getSoundPreferences() {
  if (!preferences) {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY)) || {}
      preferences = { ...defaults }
      for (const key of ['enabled', 'start', 'complete', 'error']) {
        if (typeof saved[key] === 'boolean') preferences[key] = saved[key]
      }
      if (Number.isFinite(saved.volume)) preferences.volume = Math.max(0, Math.min(100, saved.volume))
    } catch { preferences = { ...defaults } }
  }
  return { ...preferences }
}

export function saveSoundPreferences(value) {
  preferences = { ...getSoundPreferences(), ...value }
  try { localStorage.setItem(KEY, JSON.stringify(preferences)) } catch { /* Keep session preferences. */ }
}

// Call from a user gesture so Chrome, Edge and Safari can allow playback.
export async function unlockPrinterSounds() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return false
    if (!context || context.state === 'closed') {
      context = new AudioContext()
      nextToneAt = 0
    }
    if (context.state !== 'running') await context.resume()
    return context.state === 'running'
  } catch { return false }
}

const tones = {
  start: [523, 659],
  complete: [523, 659, 784],
  error: [330, 220, 330, 220],
}

export function playPrinterSound(type, preview = false) {
  const settings = getSoundPreferences()
  if (!tones[type] || (!preview && (!settings.enabled || !settings[type]))) return false
  // Never queue events behind browser autoplay blocking for later replay.
  if (!context || context.state !== 'running' || settings.volume === 0) return false
  try {
    const start = Math.max(context.currentTime, nextToneAt)
    // Bound bursts from a busy farm to a few seconds of sound.
    if (start > context.currentTime + 4) return false
    tones[type].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const at = start + index * 0.22
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(settings.volume / 100 * 0.2, at + 0.015)
      gain.gain.linearRampToValueAtTime(0, at + 0.18)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(at)
      oscillator.stop(at + 0.2)
    })
    nextToneAt = start + tones[type].length * 0.22 + 0.1
    return true
  } catch { return false }
}

export function printerSoundType(log) {
  if (!log.printer_ip) return null
  if (log.event_type === 'error') return 'error'
  // Use confirmed state events, not command acknowledgements (which duplicate starts).
  if (log.message === 'Printer started printing.') return 'start'
  if (log.message === 'Printer completed the print job.') return 'complete'
  return null
}

export function createActivityTracker() {
  let lastId = null
  return (logs) => {
    if (!Array.isArray(logs)) return []
    const newestId = Math.max(lastId ?? 0, ...logs.map((log) => log.id))
    const fresh = lastId === null ? [] : logs.filter((log) => log.id > lastId)
    lastId = newestId
    return fresh.sort((a, b) => b.id - a.id)
  }
}
