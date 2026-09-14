import { useState } from 'react'
import { getSoundPreferences, saveSoundPreferences, unlockPrinterSounds, playPrinterSound } from '../../services/printerSounds'

export function SoundSettings() {
  const [settings, setSettings] = useState(getSoundPreferences)
  const [message, setMessage] = useState('')
  const update = (key, value) => {
    const next = { ...settings, [key]: value }
    setSettings(next)
    saveSoundPreferences(next)
  }
  const test = async (type) => {
    const ready = await unlockPrinterSounds()
    const played = ready && playPrinterSound(type, true)
    setMessage(played ? 'Test sound played.' : 'Sound could not play. Check the volume and browser sound permissions, then try again.')
  }

  return <div className="flex flex-col gap-4">
    <p className="text-sm text-slate-500">Play sounds on this computer when a printer starts, finishes, or reports an error. Keep PrintOps open and click or press a key after opening it to enable audio. Preferences save automatically in this browser.</p>
    <label className="flex items-center gap-3 text-sm font-semibold">
      <input type="checkbox" checked={settings.enabled} onChange={(e) => update('enabled', e.target.checked)} />
      Enable printer sounds
    </label>
    {Object.entries({ start: 'Printing started', complete: 'Printing complete', error: 'Printer errors' }).map(([type, label]) =>
      <div key={type} className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={settings[type]} disabled={!settings.enabled} onChange={(e) => update(type, e.target.checked)} />
          {label}
        </label>
        <button type="button" className="secondary-button" onClick={() => test(type)} aria-label={`Test ${label.toLowerCase()} sound`}>Test sound</button>
      </div>
    )}
    <label className="text-sm font-semibold" htmlFor="sound-volume">Sound volume: {settings.volume}%</label>
    <input id="sound-volume" type="range" min="0" max="100" value={settings.volume} onChange={(e) => update('volume', Number(e.target.value))} className="max-w-md accent-orange-500" />
    {message && <p role="status" className="text-sm text-slate-500">{message}</p>}
  </div>
}
