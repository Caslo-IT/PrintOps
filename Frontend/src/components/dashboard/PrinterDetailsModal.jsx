import { X } from 'lucide-react'
import { DataRow } from './PrinterCard'
import { StatusBadge } from './StatusBadge'

export function PrinterDetailsModal({ printer, onClose }) {
  if (!printer) return null
  const topLevelFields = Object.entries(printer).filter(([key]) => !['details', 'color', 'name', 'model', 'job', 'eta', 'layer'].includes(key))

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="details-modal" role="dialog" aria-modal="true" aria-labelledby="printer-details-title"><div className="flex items-start justify-between border-b border-slate-100 p-5 sm:p-6"><div><div className="mb-2 flex items-center gap-2"><StatusBadge state={printer.state} /><span className="font-mono text-[11px] text-slate-400">{printer.ip}</span></div><h2 id="printer-details-title" className="text-xl font-bold tracking-[-.04em]">{printer.name}</h2><p className="mt-1 text-xs text-slate-500">Complete printer information from the API</p></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></div><div className="max-h-[70vh] space-y-6 overflow-y-auto p-5 sm:p-6"><section><h3 className="mb-3 text-xs font-bold uppercase tracking-[.14em] text-slate-400">Printer summary</h3><div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{topLevelFields.map(([key, value]) => <DataRow key={key} label={key} value={value} />)}</div></section><section><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Printer details</h3><span className="text-[11px] text-slate-400">{Object.keys(printer.details || {}).length} fields</span></div><div className="space-y-3">{Object.entries(printer.details || {}).map(([key, value]) => <ReadableDetail key={key} label={key} value={value} />)}</div></section></div><div className="flex justify-end border-t border-slate-100 p-4"><button className="secondary-button" onClick={onClose}>Close</button></div></div></div>
}

function ReadableDetail({ label, value }) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><h4 className="mb-2 text-xs font-bold text-slate-700">{humanize(label)}</h4><div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">{Object.entries(value).map(([key, nestedValue]) => <DataRow key={key} label={key} value={nestedValue} />)}</div></div>
  }
  return <div className="rounded-xl border border-slate-100 bg-white px-3 py-2.5"><DataRow label={label} value={value} /></div>
}

function humanize(value) {
  return String(value).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
