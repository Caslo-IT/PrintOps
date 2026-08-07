import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Play, Printer, RefreshCw, Wifi } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { MetricCard } from './components/dashboard/MetricCard'
import { PrinterDetail } from './components/dashboard/PrinterDetail'
import { PrinterList } from './components/dashboard/PrinterList'
import { PrintersWorkspace } from './components/dashboard/PrintersWorkspace'
import { API_BASE, normalizePrinter } from './data/printers'
import './styles.css'

function App() {
  const [printers, setPrinters] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [scanning, setScanning] = useState(false)
  const [apiError, setApiError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('just now')
  const [activeView, setActiveView] = useState('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavOpen, setDesktopNavOpen] = useState(true)

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const response = await fetch(`${API_BASE}/printers`)
      if (!response.ok) throw new Error('Scan failed')
      const data = await response.json()
      const result = Array.isArray(data.printers) ? data.printers.map(normalizePrinter) : []
      setPrinters(result)
      setSelected((current) => result.find((printer) => printer.ip === current?.ip) || result[0] || null)
      setApiError('')
    } catch {
      setPrinters([])
      setSelected(null)
      setApiError(`Could not connect to ${API_BASE}/printers`)
    }
    setLastUpdated('just now')
    setScanning(false)
  }, [])

  useEffect(() => { scan() }, [scan])

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && setMobileNavOpen(false)
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const stats = useMemo(() => ({
    total: printers.length,
    online: printers.filter((printer) => printer.online).length,
    printing: printers.filter((printer) => ['printing', 'preparing'].includes(printer.state)).length,
    attention: printers.filter((printer) => ['paused', 'error'].includes(printer.state)).length,
  }), [printers])

  return <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
    <Sidebar printerCount={stats.total} activeView={activeView} mobileOpen={mobileNavOpen} desktopOpen={desktopNavOpen} onClose={() => setMobileNavOpen(false)} onNavigate={(view) => { setActiveView(view); setMobileNavOpen(false) }} />
    <main className={desktopNavOpen ? 'lg:pl-[248px]' : ''}><Header onMenuClick={() => { setDesktopNavOpen((open) => !open); setMobileNavOpen((open) => !open) }} />
      <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-10">
        {activeView === 'printers' ? <PrintersWorkspace printers={printers} selected={selected} query={query} apiError={apiError} scanning={scanning} onQueryChange={setQuery} onSelect={setSelected} onScan={scan} lastUpdated={lastUpdated} /> : <>
        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm text-slate-500"><span>Workspace</span><span>/</span><span className="font-medium text-slate-900">Overview</span></div><h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Fleet overview</h2><p className="mt-1 text-sm text-slate-500">Monitor your print farm at a glance.</p></div><button onClick={scan} disabled={scanning} className="primary-button"><RefreshCw size={16} className={scanning ? 'spin' : ''} />{scanning ? 'Scanning network...' : 'Scan network'}</button></div>
        <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Total printers" value={stats.total} note="Across your network" icon={<Printer size={18} />} tone="orange" /><MetricCard label="Online now" value={stats.online} note={`${Math.round((stats.online / Math.max(stats.total, 1)) * 100)}% availability`} icon={<Wifi size={18} />} tone="green" /><MetricCard label="Currently printing" value={stats.printing} note="Active print jobs" icon={<Play size={18} />} tone="blue" /><MetricCard label="Needs attention" value={stats.attention} note={stats.attention ? 'Review paused jobs' : 'Everything looks good'} icon={<AlertTriangle size={18} />} tone="purple" /></div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]"><PrinterList printers={printers} selected={selected} query={query} apiError={apiError} onQueryChange={setQuery} onSelect={setSelected} onScan={scan} lastUpdated={lastUpdated} /><PrinterDetail printer={selected} /></div>
        </>}
      </div>
    </main>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
