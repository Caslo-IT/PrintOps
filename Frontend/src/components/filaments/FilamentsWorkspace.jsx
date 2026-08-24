import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Edit2, AlertCircle, RefreshCw, Zap, WifiOff } from 'lucide-react'
import { api } from '../../services/api'

const LIVE_POLL_INTERVAL_MS = 5000

/** Derive the display label and stored value for a printer in the dropdown.
 *  We always prefer a human-readable name, but fall back to the IP so the
 *  backend can still match via the IP-based lookup in activity_logger. */
function printerLabel(p) {
  return p.name || p.ip
}

function PrinterStateBadge({ state, progress }) {
  if (!state || state === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
        <WifiOff size={11} />
        Offline
      </span>
    )
  }
  if (state === 'printing') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"
        style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-500"
          style={{ animation: 'pulse 1s cubic-bezier(0.4,0,0.6,1) infinite' }}
        />
        PRINTING {progress > 0 ? `${progress.toFixed(1)}%` : ''}
      </span>
    )
  }
  if (state === 'paused') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
        ⏸ Paused
      </span>
    )
  }
  if (state === 'idle' || state === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
        ✓ Idle
      </span>
    )
  }
  return (
    <span className="text-xs text-slate-400 capitalize">{state}</span>
  )
}

export function FilamentsWorkspace({ onNotify }) {
  const [filaments, setFilaments] = useState([])
  const [printers, setPrinters] = useState([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const liveIntervalRef = useRef(null)

  const [formData, setFormData] = useState({
    name: '',
    material: 'PLA',
    color: 'Black',
    total_weight_g: 1000,
    remaining_weight_g: 1000,
    assigned_printer_name: '',
  })

  // ── Initial full load (filaments + printers scan) ──────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [filamentsData, printersData] = await Promise.all([
        api.getLiveFilaments().catch(() => api.getFilaments().catch(() => ({ filaments: [] }))),
        api.scanPrinters().catch(() => ({ printers: [] })),
      ])
      setFilaments(filamentsData?.filaments || [])
      setPrinters(printersData?.printers || [])
    } catch {
      onNotify('Failed to load filaments data', 'error')
    }
    setLoading(false)
  }, [onNotify])

  // ── Background live poll — only updates the filament list, no spinner ──────
  const pollLive = useCallback(async () => {
    try {
      const data = await api.getLiveFilaments()
      if (data?.filaments) {
        setFilaments(data.filaments)

        // For every printer that is actively printing, call the progress
        // endpoint. This triggers the backend to write the accurate
        // layer-based filament deduction to the DB so the next poll cycle
        // reflects the true spool remaining weight.
        const printingIps = [
          ...new Set(
            data.filaments
              .filter(f => f.printer_state === 'printing' && f.printer_ip)
              .map(f => f.printer_ip)
          ),
        ]
        if (printingIps.length > 0) {
          await Promise.allSettled(
            printingIps.map(ip => api.getPrinterPrintProgress(ip))
          )
        }
      }
    } catch {
      // Silently ignore — the static data stays visible
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Start/stop live polling whenever the modal closes / opens.
  // We pause polling while the modal is open to avoid stale-data overwrites.
  useEffect(() => {
    if (isModalOpen) {
      clearInterval(liveIntervalRef.current)
    } else {
      liveIntervalRef.current = setInterval(pollLive, LIVE_POLL_INTERVAL_MS)
    }
    return () => clearInterval(liveIntervalRef.current)
  }, [isModalOpen, pollLive])

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const handleOpenModal = (filament = null) => {
    if (filament) {
      setEditingId(filament.id)
      setFormData({
        name: filament.name,
        material: filament.material,
        color: filament.color,
        total_weight_g: filament.total_weight_g,
        remaining_weight_g: filament.remaining_weight_g,
        assigned_printer_name: filament.assigned_printer_name || '',
      })
    } else {
      setEditingId(null)
      setFormData({
        name: '',
        material: 'PLA',
        color: 'Black',
        total_weight_g: 1000,
        remaining_weight_g: 1000,
        assigned_printer_name: '',
      })
    }
    setIsModalOpen(true)
  }

  const handleCloseModal = () => setIsModalOpen(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        total_weight_g: Number(formData.total_weight_g),
        remaining_weight_g: Number(formData.remaining_weight_g),
        assigned_printer_name: formData.assigned_printer_name || null,
      }
      if (editingId) {
        await api.updateFilament(editingId, payload)
        onNotify('Filament updated successfully')
      } else {
        await api.createFilament(payload)
        onNotify('Filament added successfully')
      }
      handleCloseModal()
      loadData()
    } catch (err) {
      onNotify(err.message || 'Failed to save filament', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this filament?')) return
    try {
      await api.deleteFilament(id)
      onNotify('Filament deleted successfully')
      loadData()
    } catch {
      onNotify('Failed to delete filament', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Filaments</span>
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            Filament Inventory
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage filament spools and their assignments to printers.
            <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-medium">
              <Zap size={12} />
              Live updates every {LIVE_POLL_INTERVAL_MS / 1000}s
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="secondary-button" disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button onClick={() => handleOpenModal()} className="primary-button">
            <Plus size={16} />
            Add Spool
          </button>
        </div>
      </div>

      {/* Filament Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filaments.map((filament) => {
          // Use live projected weight when actively printing, otherwise DB value
          const isPrinting = filament.printer_state === 'printing'
          const displayRemaining =
            isPrinting && filament.live_remaining_weight_g !== undefined
              ? filament.live_remaining_weight_g
              : filament.remaining_weight_g

          const percentage = Math.max(
            0,
            Math.min(100, (displayRemaining / filament.total_weight_g) * 100)
          )
          const isLow = displayRemaining < 200

          // Bar color: green → amber when low → red when very low
          const barColor = isLow
            ? displayRemaining < 50
              ? 'bg-red-500'
              : 'bg-amber-500'
            : isPrinting
            ? 'bg-emerald-500'
            : 'bg-blue-500'

          return (
            <div
              key={filament.id}
              className={`card p-5 group flex flex-col justify-between transition-shadow ${
                isPrinting ? 'ring-2 ring-emerald-300 shadow-emerald-100 shadow-md' : ''
              }`}
            >
              <div>
                {/* Title + actions */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{filament.name}</h3>
                    <p className="text-sm text-slate-500">
                      {filament.color} {filament.material}
                    </p>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenModal(filament)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(filament.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Weight progress */}
                <div className="mt-6">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-slate-500">Remaining</span>
                    <span className={`font-medium tabular-nums ${isLow ? 'text-red-600' : 'text-slate-900'}`}>
                      {displayRemaining.toFixed(1)}g
                      <span className="text-slate-400 font-normal"> / {filament.total_weight_g}g</span>
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-linear ${barColor}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  {/* Status badges */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {isLow && (
                      <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                        <AlertCircle size={13} />
                        Low filament
                      </div>
                    )}
                    {isPrinting && filament.printer_job_filename && (
                      <span className="text-xs text-slate-400 truncate max-w-[160px]" title={filament.printer_job_filename}>
                        📄 {filament.printer_job_filename.split('/').pop()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer — assigned printer + live state */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-sm">
                  <span className="text-slate-500">Assigned: </span>
                  {filament.assigned_printer_name ? (
                    <span className="font-medium text-slate-900">
                      {filament.assigned_printer_name}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </p>
                {filament.assigned_printer_name && (
                  <PrinterStateBadge
                    state={filament.printer_state}
                    progress={filament.printer_progress}
                  />
                )}
              </div>
            </div>
          )
        })}

        {filaments.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center bg-white rounded-xl border border-slate-200 border-dashed">
            <h3 className="text-sm font-medium text-slate-900">No filaments found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Get started by adding a new filament spool to track.
            </p>
            <button onClick={() => handleOpenModal()} className="mt-4 primary-button mx-auto">
              <Plus size={16} />
              Add Spool
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? 'Edit Filament' : 'Add Filament'}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600">
                <span className="text-xl leading-none">&times;</span>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <input
                  type="text"
                  required
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Material</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.material}
                    onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  >
                    <option value="PLA">PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="ABS">ABS</option>
                    <option value="TPU">TPU</option>
                    <option value="ASA">ASA</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Color</label>
                  <input
                    type="text"
                    required
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Total Weight (g)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.total_weight_g}
                    onChange={(e) =>
                      setFormData({ ...formData, total_weight_g: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Remaining (g)
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    max={formData.total_weight_g}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.remaining_weight_g}
                    onChange={(e) =>
                      setFormData({ ...formData, remaining_weight_g: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Assign to Printer
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={formData.assigned_printer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, assigned_printer_name: e.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {printers.map((p) => (
                    <option key={p.ip} value={printerLabel(p)}>
                      {printerLabel(p)}
                    </option>
                  ))}
                </select>
                {printers.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    No printers discovered. Refresh printers or enter a name manually.
                  </p>
                )}
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  {editingId ? 'Save Changes' : 'Add Filament'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
