import { Search, SlidersHorizontal } from 'lucide-react'
import { PrinterRow } from './PrinterRow'

export function PrinterList({ printers, selected, query, apiError, onQueryChange, onSelect, onScan, lastUpdated }) {
  const filtered = printers.filter((printer) => `${printer.name} ${printer.ip} ${printer.state}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="panel">
    <div className="flex flex-col justify-between gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:p-6"><div><h3 className="font-bold tracking-[-.02em]">Your printers</h3><p className="mt-1 text-xs text-slate-500">{printers.filter((printer) => printer.online).length} of {printers.length} devices responding</p></div><div className="flex gap-2"><div className="search-wrap"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search printers" /></div><button className="icon-button"><SlidersHorizontal size={16} /></button></div></div>
    {apiError && <div className="mx-6 mt-5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{apiError}</div>}
    <div className="divide-y divide-slate-100">{filtered.map((printer) => <PrinterRow key={printer.ip} printer={printer} selected={selected?.ip === printer.ip} onClick={() => onSelect(printer)} />)}{!filtered.length && <div className="p-10 text-center text-sm text-slate-500">{apiError ? 'Start the backend API to discover printers.' : 'No printers found on the network.'}</div>}</div>
    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4"><span className="text-xs text-slate-400">Last synced {lastUpdated}</span><button onClick={onScan} className="text-xs font-bold text-orange-600 hover:text-orange-700">Refresh data <span className="ml-1">→</span></button></div>
  </section>
}
