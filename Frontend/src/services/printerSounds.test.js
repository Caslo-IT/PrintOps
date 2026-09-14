import { beforeEach, describe, expect, it, vi } from 'vitest'

let sounds
let oscillators
let audioContext
beforeEach(async () => {
  vi.resetModules()
  const storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  })
  oscillators = []
  audioContext = {
    state: 'suspended', currentTime: 0, destination: {},
    resume: vi.fn(async () => { audioContext.state = 'running' }),
    createOscillator: () => {
      const oscillator = { frequency: {}, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() }
      oscillators.push(oscillator)
      return oscillator
    },
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }),
  }
  vi.stubGlobal('AudioContext', function () { return audioContext })
  sounds = await import('./printerSounds')
})

describe('printer event tracking', () => {
  it('skips history, handles an initially empty feed, and does not replay events', () => {
    const track = sounds.createActivityTracker()
    expect(track([])).toEqual([])
    expect(track([{ id: 1 }])).toEqual([{ id: 1 }])
    expect(track([{ id: 1 }])).toEqual([])
    expect(track([{ id: 3 }, { id: 2 }])).toEqual([{ id: 3 }, { id: 2 }])
    expect(track([{ id: 2 }])).toEqual([])
    const initial = sounds.createActivityTracker()
    expect(initial([{ id: 8 }, { id: 7 }])).toEqual([])
    expect(initial([{ id: 9 }, { id: 8 }])).toEqual([{ id: 9 }])
  })

  it('recognizes confirmed transitions and errors without duplicating command acknowledgements', () => {
    const event = (message, event_type = 'info') => sounds.printerSoundType({ printer_ip: '192.168.1.5', message, event_type })
    expect(event('Printer started printing.')).toBe('start')
    expect(event('Printer completed the print job.')).toBe('complete')
    expect(event('Failed to start print manually: part.gcode', 'error')).toBe('error')
    expect(event('Started print manually: part.gcode')).toBeNull()
    expect(event('Print started: part.gcode')).toBeNull()
    expect(event('Printer is now idle.')).toBeNull()
    expect(event('Printer paused.')).toBeNull()
  })
})

describe('audio playback', () => {
  it('drops blocked events, unlocks audio, and releases nodes after playback', async () => {
    expect(sounds.playPrinterSound('start')).toBe(false)
    expect(await sounds.unlockPrinterSounds()).toBe(true)
    expect(oscillators).toHaveLength(0)
    expect(sounds.playPrinterSound('start')).toBe(true)
    expect(oscillators.map((o) => o.frequency.value)).toEqual([523, 659])
    oscillators[0].onended()
    expect(oscillators[0].disconnect).toHaveBeenCalledOnce()
  })

  it('honors mute, event preferences and volume while allowing explicit previews', async () => {
    await sounds.unlockPrinterSounds()
    sounds.saveSoundPreferences({ enabled: false })
    expect(sounds.playPrinterSound('error')).toBe(false)
    expect(sounds.playPrinterSound('error', true)).toBe(true)
    sounds.saveSoundPreferences({ enabled: true, start: false })
    expect(sounds.playPrinterSound('start')).toBe(false)
    sounds.saveSoundPreferences({ volume: 0 })
    expect(sounds.playPrinterSound('complete', true)).toBe(false)
    expect(JSON.parse(localStorage.getItem('printops.printerSounds')).volume).toBe(0)
  })

  it('fails safely when audio is unsupported or resume rejects', async () => {
    audioContext.resume.mockRejectedValueOnce(new Error('blocked'))
    expect(await sounds.unlockPrinterSounds()).toBe(false)
    expect(sounds.playPrinterSound('error')).toBe(false)
  })

  it('bounds sound bursts instead of building an unbounded queue', async () => {
    await sounds.unlockPrinterSounds()
    const results = Array.from({ length: 20 }, () => sounds.playPrinterSound('error'))
    expect(results.filter(Boolean).length).toBeLessThan(7)
  })
})
