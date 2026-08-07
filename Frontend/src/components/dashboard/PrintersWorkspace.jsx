import { Printer, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { PrinterCard } from './PrinterCard'
import { PrinterDetailsModal } from './PrinterDetailsModal'

export function PrintersWorkspace({ printers, selected, query, apiError, scanning, onQueryChange, onSelect, onScan, lastUpdated }) {
  const [detailsPrinter, setDetailsPrinter] = useState(null)
  const filteredPrinters = printers.filter((printer) => `${printer.name} ${printer.ip} ${printer.state}`.toLowerCase().includes(query.toLowerCase()))

  return <>
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm text-slate-500"><span>Workspace</span><span>/</span><span className="font-medium text-slate-900">Printers</span></div><h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Printer workspace</h2><p className="mt-1 text-sm text-slate-500">Inspect and manage every printer on your network.</p></div><button onClick={onScan} disabled={scanning} className="primary-button"><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Scanning network...' : 'Scan network'}</button></div>
    <div className="mb-6 flex flex-wrap gap-3"><WorkspaceStat icon={<Printer size={16} />} label="All printers" value={printers.length} /><WorkspaceStat icon={<span className="h-2 w-2 rounded-full bg-emerald-500" />} label="Online" value={printers.filter((printer) => printer.online).length} /><div className="ml-auto hidden items-center gap-2 text-xs text-slate-400 sm:flex"><Search size={14} />Use search to filter by name, IP, or state</div></div>
    <div className="mb-5 flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center"><div><p className="text-sm font-bold">All printers</p><p className="mt-1 text-xs text-slate-500">{filteredPrinters.length} printer{filteredPrinters.length === 1 ? '' : 's'} shown</p></div><div className="flex gap-2"><div className="search-wrap"><Search size={15} /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search printers" /></div></div></div>
    {apiError && <div className="mb-5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{apiError}</div>}
    {filteredPrinters.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filteredPrinters.map((printer) => <PrinterCard key={printer.ip} printer={printer} onViewDetails={setDetailsPrinter} />)}</div> : <div className="panel p-12 text-center text-sm text-slate-500">{apiError ? 'Start the backend API to discover printers.' : 'No printers found on the network.'}</div>}
    <div className="mt-5 flex justify-end"><span className="text-xs text-slate-400">Last synced {lastUpdated}</span></div>
    <PrinterDetailsModal printer={detailsPrinter} onClose={() => setDetailsPrinter(null)} />
  </>
}

function WorkspaceStat({ icon, label, value }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3"><span className="text-orange-500">{icon}</span><span className="text-xs text-slate-500">{label}</span><strong className="text-sm">{value}</strong></div>
}
