import React, { useState } from 'react'
import { ExternalLink, Gauge, HardDrive, Pause, Play, Square, Thermometer } from 'lucide-react'
import { formatTemperature, isActiveJob } from '../../data/printers'
import { api } from '../../services/api'
import { PrinterStorageModal } from './PrinterStorageModal'
import { StatusBadge } from './StatusBadge'

export function PrinterDetail({ printer, onRefresh, onNotify }) {
  const [storageOpen, setStorageOpen] = useState(false)
  const [busyAction, setBusyAction] = useState('')

  if (!printer)
    return (
      <section className="panel flex min-h-[330px] items-center justify-center p-6 text-center text-sm text-slate-400">
        Select a printer to view its details.
      </section>
    )

  const activeJob = isActiveJob(printer.state)

  const handleControl = async (action) => {
    setBusyAction(action)
    try {
      if (action === 'pause') await api.pausePrinter(printer.ip)
      else if (action === 'resume') await api.resumePrinter(printer.ip)
      else if (action === 'stop') await api.stopPrinter(printer.ip)

      onNotify?.(`${action.toUpperCase()} command sent to ${printer.name}`)
      onRefresh?.()
    } catch (err) {
      onNotify?.(`Error sending ${action}: ${err.message}`, 'error')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-100 p-6">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge state={printer.state} />
                <span className="text-[11px] text-slate-400">{printer.protocol}</span>
              </div>
              <h3 className="text-xl font-bold tracking-[-.04em]">{printer.name}</h3>
              <p className="mt-1 font-mono text-[11px] text-slate-400">{printer.ip}</p>
            </div>
            <button
              onClick={() => setStorageOpen(true)}
              className="secondary-button text-xs"
              title="Manage files on printer storage"
            >
              <HardDrive size={14} />
              Storage
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Current job</p>
              <p className="mt-2 max-w-[210px] truncate text-sm font-bold">{printer.job}</p>
              <p className="mt-1 text-[11px] text-slate-400">Layer {printer.layer}</p>
            </div>
            {activeJob ? (
              <div className="text-right">
                <p className="text-2xl font-bold tracking-[-.06em]">{printer.progress}%</p>
                <p className="text-[10px] text-slate-400">{printer.eta} remaining</p>
              </div>
            ) : (
              <div className="rounded-lg bg-white p-2 text-slate-400">
                <HardDrive size={18} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-slate-100">
          <Stat icon={<Thermometer size={17} />} label="Nozzle" value={formatTemperature(printer.nozzle)} />
          <Stat icon={<Gauge size={17} />} label="Bed" value={formatTemperature(printer.bed)} />
        </div>

        <div className="flex flex-wrap gap-2 p-5">
          {printer.web_ui && (
            <a className="secondary-button flex-1" href={printer.web_ui} target="_blank" rel="noreferrer">
              Open UI <ExternalLink size={14} />
            </a>
          )}

          {printer.state === 'printing' && (
            <button
              onClick={() => handleControl('pause')}
              disabled={!!busyAction}
              className="secondary-button text-amber-600 hover:bg-amber-50"
              title="Pause Print"
            >
              <Pause size={15} />
              Pause
            </button>
          )}

          {printer.state === 'paused' && (
            <button
              onClick={() => handleControl('resume')}
              disabled={!!busyAction}
              className="primary-button"
              title="Resume Print"
            >
              <Play size={15} />
              Resume
            </button>
          )}

          {activeJob && (
            <button
              onClick={() => handleControl('stop')}
              disabled={!!busyAction}
              className="secondary-button text-red-600 hover:bg-red-50"
              title="Cancel Print"
            >
              <Square size={15} />
              Stop
            </button>
          )}
        </div>
      </section>

      {storageOpen && (
        <PrinterStorageModal printer={printer} onClose={() => setStorageOpen(false)} onNotify={onNotify} />
      )}
    </>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="bg-white p-5">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-2 text-lg font-bold">{value}</p>
    </div>
  )
}
