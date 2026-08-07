import { MoreHorizontal, Printer } from 'lucide-react'
import { isActiveJob } from '../../data/printers'
import { StatusBadge } from './StatusBadge'

export function PrinterRow({ printer, selected, onClick }) {
  const state = printer.state || 'unknown'
  return <button onClick={onClick} className={`printer-row ${selected ? 'selected' : ''}`}>
    <div className={`printer-icon ${printer.color}`}><Printer size={21} /></div>
    <div className="min-w-0 flex-1 text-left"><div className="flex items-center gap-2"><h4 className="truncate text-sm font-bold">{printer.name}</h4><StatusBadge state={state} /></div><p className="mt-1 font-mono text-[11px] text-slate-400">{printer.ip} <span className="mx-1">·</span> {printer.model}</p></div>
    <div className="hidden w-[170px] sm:block">{isActiveJob(state) ? <><div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>{printer.progress}% complete</span><span>{printer.eta}</span></div><div className="progress"><span style={{ width: `${printer.progress}%` }} /></div></> : <span className="text-xs text-slate-400">{printer.job}</span>}</div>
    <MoreHorizontal size={18} className="ml-4 text-slate-300" />
  </button>
}
