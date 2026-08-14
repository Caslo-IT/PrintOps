import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle, Info, Play, Printer, RefreshCw, Wifi, X } from 'lucide-react'
import { createRoot } from 'react-dom/client'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { MetricCard } from './components/dashboard/MetricCard'
import { PrinterDetail } from './components/dashboard/PrinterDetail'
import { PrinterList } from './components/dashboard/PrinterList'
import { PrintersWorkspace } from './components/dashboard/PrintersWorkspace'
import { GCodeStorageWorkspace } from './components/storage/GCodeStorageWorkspace'
import { QueueWorkspace } from './components/queue/QueueWorkspace'
import { ActivityLogWorkspace } from './components/activity/ActivityLogWorkspace'
import { API_BASE, normalizePrinter } from './data/printers'
import { api } from './services/api'
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

  const [queueCount, setQueueCount] = useState(0)
  const [storageCount, setStorageCount] = useState(0)
  const [toast, setToast] = useState(null)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current))
    }, 4000)
  }, [])

  const scan = useCallback(async (isBackground = false) => {
    const isAutoRefresh = isBackground === true
    if (!isAutoRefresh) setScanning(true)
    try {
      const data = await api.scanPrinters()
      const result = Array.isArray(data.printers) ? data.printers.map(normalizePrinter) : []
      setPrinters(result)
      setSelected((current) => result.find((printer) => printer.ip === current?.ip) || result[0] || null)
      setApiError('')
    } catch (err) {
      if (!isAutoRefresh) {
        setPrinters([])
        setSelected(null)
      }
      setApiError(`Could not connect to backend API: ${err.message}`)
    }
    setLastUpdated(new Date().toLocaleTimeString())
    if (!isAutoRefresh) setScanning(false)
  }, [])

  const loadCounts = useCallback(async () => {
    try {
      const [queueData, filesData] = await Promise.all([
        api.getPrintQueue().catch(() => ({ queue: [] })),
        api.listGCodeFiles().catch(() => ({ files: [] })),
      ])
      setQueueCount(queueData.queue?.length || 0)
      setStorageCount(filesData.files?.length || 0)
    } catch {
      // ignore badge load errors
    }
  }, [])

  useEffect(() => {
    scan()
    loadCounts()

    const intervalId = setInterval(() => {
      scan(true)
      loadCounts()
    }, 10000)

    return () => clearInterval(intervalId)
  }, [scan, loadCounts])

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && setMobileNavOpen(false)
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])

  const stats = useMemo(
    () => ({
      total: printers.length,
      online: printers.filter((printer) => printer.online).length,
      printing: printers.filter((printer) => ['printing', 'preparing'].includes(printer.state)).length,
      attention: printers.filter((printer) => ['paused', 'error'].includes(printer.state)).length,
    }),
    [printers]
  )

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-950">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border p-4 shadow-xl transition-all ${
            toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-slate-200 bg-slate-900 text-white'
          }`}
        >
          {toast.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} className="text-orange-400" />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      )}

      <Sidebar
        printerCount={stats.total}
        queueCount={queueCount}
        storageCount={storageCount}
        activeView={activeView}
        mobileOpen={mobileNavOpen}
        desktopOpen={desktopNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onNavigate={(view) => {
          setActiveView(view)
          setMobileNavOpen(false)
          loadCounts()
        }}
      />

      <main className={desktopNavOpen ? 'lg:pl-[248px]' : ''}>
        <Header
          onMenuClick={() => {
            setDesktopNavOpen((open) => !open)
            setMobileNavOpen((open) => !open)
          }}
        />

        <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-10">
          {activeView === 'printers' ? (
            <PrintersWorkspace
              printers={printers}
              selected={selected}
              query={query}
              apiError={apiError}
              scanning={scanning}
              onQueryChange={setQuery}
              onSelect={setSelected}
              onScan={scan}
              lastUpdated={lastUpdated}
              onNotify={notify}
            />
          ) : activeView === 'storage' ? (
            <GCodeStorageWorkspace onNotify={notify} onNavigateToQueue={() => setActiveView('queue')} />
          ) : activeView === 'queue' ? (
            <QueueWorkspace onNotify={notify} />
          ) : activeView === 'activity' ? (
            <ActivityLogWorkspace onNotify={notify} />
          ) : (
            <>
              {/* Overview View */}
              <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Workspace</span>
                    <span>/</span>
                    <span className="font-medium text-slate-900">Overview</span>
                  </div>
                  <h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Fleet overview</h2>
                  <p className="mt-1 text-sm text-slate-500">Monitor your print farm at a glance.</p>
                </div>
                <button onClick={scan} disabled={scanning} className="primary-button">
                  <RefreshCw size={16} className={scanning ? 'spin' : ''} />
                  {scanning ? 'Scanning network...' : 'Scan network'}
                </button>
              </div>

              <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Total printers"
                  value={stats.total}
                  note="Across your network"
                  icon={<Printer size={18} />}
                  tone="orange"
                />
                <MetricCard
                  label="Online now"
                  value={stats.online}
                  note={`${Math.round((stats.online / Math.max(stats.total, 1)) * 100)}% availability`}
                  icon={<Wifi size={18} />}
                  tone="green"
                />
                <MetricCard
                  label="Currently printing"
                  value={stats.printing}
                  note="Active print jobs"
                  icon={<Play size={18} />}
                  tone="blue"
                />
                <MetricCard
                  label="Needs attention"
                  value={stats.attention}
                  note={stats.attention ? 'Review paused jobs' : 'Everything looks good'}
                  icon={<AlertTriangle size={18} />}
                  tone="purple"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
                <PrinterList
                  printers={printers}
                  selected={selected}
                  query={query}
                  apiError={apiError}
                  onQueryChange={setQuery}
                  onSelect={setSelected}
                  onScan={scan}
                  lastUpdated={lastUpdated}
                />
                <PrinterDetail printer={selected} onRefresh={scan} onNotify={notify} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
