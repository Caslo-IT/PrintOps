import { ExternalLink, Eye, Printer } from 'lucide-react'
import { isActiveJob } from '../../data/printers'
import { StatusBadge } from './StatusBadge'

export function PrinterCard({ printer, onViewDetails }) {
  const state = printer.state || 'unknown'
  const topLevelFields = Object.entries(printer).filter(([key]) => !['details', 'color', 'name', 'model', 'job', 'eta', 'layer', 'ip', 'state', 'progress', 'nozzle', 'bed'].includes(key))

  return <article className="printer-card">
    <div className="flex items-start justify-between gap-3"><div className={`printer-icon ${printer.color}`}><Printer size={21} /></div><StatusBadge state={state} /></div>
    <div className="mt-4"><h3 className="truncate text-base font-bold tracking-[-.02em]">{printer.name}</h3><p className="mt-1 font-mono text-[11px] text-slate-400">{printer.ip}</p></div>
    <div className="mt-5 rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Current job</p><p className="mt-1 truncate text-xs font-semibold text-slate-700">{printer.job}</p></div><span className="shrink-0 text-sm font-bold text-slate-900">{printer.progress}%</span></div>{isActiveJob(state) && <div className="mt-3 progress"><span style={{ width: `${printer.progress}%` }} /></div>}</div>
    <div className="mt-4 grid grid-cols-2 gap-2"><Summary label="Nozzle" value={`${printer.nozzle.toFixed(1)}°C`} /><Summary label="Bed" value={`${printer.bed.toFixed(1)}°C`} /><Summary label="ETA" value={printer.eta} /><Summary label="Layer" value={printer.layer} /></div>
    {topLevelFields.length > 0 && <div className="mt-4 border-t border-slate-100 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Additional data</p><div className="space-y-1.5">{topLevelFields.map(([key, value]) => <DataRow key={key} label={key} value={value} />)}</div></div>}
    <div className="mt-5 flex gap-2"><button className="secondary-button flex-1" onClick={() => onViewDetails(printer)}><Eye size={14} />View details</button>{printer.web_ui && <a className="icon-button" href={printer.web_ui} target="_blank" rel="noreferrer" aria-label="Open printer UI"><ExternalLink size={15} /></a>}</div>
  </article>
}

function Summary({ label, value }) {
  return <div className="rounded-lg border border-slate-100 bg-white p-2.5"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-800">{value}</p></div>
}

export function DataRow({ label, value }) {
  const displayValue = Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? Object.entries(value).map(([key, nestedValue]) => `${key}: ${nestedValue}`).join(' · ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? '—')
  const readableLabel = String(label).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  return <div className="flex items-start justify-between gap-3 text-[11px]"><span className="break-all text-slate-400">{readableLabel}</span><span className="max-w-[62%] break-all text-right font-medium text-slate-700">{displayValue}</span></div>
}
