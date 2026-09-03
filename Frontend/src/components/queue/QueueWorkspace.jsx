import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, Edit2, HardDrive, Play, Plus, Printer, RefreshCw, Send, Trash2 } from 'lucide-react'
import { formatDuration, normalizePrinter } from '../../data/printers'
import { api } from '../../services/api'
import { ConfirmModal } from '../common/ConfirmModal'
import { StatusBadge } from '../dashboard/StatusBadge'

let cachedQueue = []
let cachedPrintersQueueStatus = []
let cachedStatusFilter = ''
let cachedPrinterFilter = ''
let hasCachedQueueData = false

export function QueueWorkspace({ onNotify }) {
  const [queue, setQueue] = useState(cachedQueue)
  const [printersQueueStatus, setPrintersQueueStatus] = useState(cachedPrintersQueueStatus)
  const [statusFilter, setStatusFilter] = useState(cachedStatusFilter)
  const [printerFilter, setPrinterFilter] = useState(cachedPrinterFilter)
  const [loading, setLoading] = useState(!hasCachedQueueData)

  // Edit item modal
  const [editItem, setEditItem] = useState(null)
  const [editPriority, setEditPriority] = useState(1)
  const [editStatus, setEditStatus] = useState('queued')
  const [editPrinterIp, setEditPrinterIp] = useState('')
  const [updating, setUpdating] = useState(false)

  // Schedule modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [sourceType, setSourceType] = useState('local') // 'local' | 'printer'

  // Local server file schedule state
  const [gcodeFiles, setGcodeFiles] = useState([])
  const [selectedFileId, setSelectedFileId] = useState('')

  // Printer storage file schedule state
  const [selectedPrinterIp, setSelectedPrinterIp] = useState('')
  const [localTargetPrinter, setLocalTargetPrinter] = useState('')
  const [printerFiles, setPrinterFiles] = useState([])
  const [loadingPrinterFiles, setLoadingPrinterFiles] = useState(false)
  const [selectedPrinterFilePath, setSelectedPrinterFilePath] = useState('')

  const [schedulePriority, setSchedulePriority] = useState(1)
  const [scheduling, setScheduling] = useState(false)
  const [dispatchingId, setDispatchingId] = useState(null)
  const [confirmConfig, setConfirmConfig] = useState(null)

  const loadQueueData = async () => {
    if (!hasCachedQueueData) setLoading(true)
    try {
      const queueData = await api.getPrintQueue(statusFilter, printerFilter)
      
      cachedQueue = queueData.queue || []
      cachedStatusFilter = statusFilter
      cachedPrinterFilter = printerFilter
      hasCachedQueueData = true
      
      setQueue(cachedQueue)
    } catch (err) {
      onNotify?.(`Failed to load queue data: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadPrinterStatus = async () => {
    try {
      const printersData = await api.getPrintersQueueStatus()
      cachedPrintersQueueStatus = printersData.printers || []
      setPrintersQueueStatus(cachedPrintersQueueStatus)
    } catch (err) {
      onNotify?.(`Failed to load printer availability: ${err.message}`, 'error')
    }
  }

  const loadData = () => {
    loadQueueData()
    loadPrinterStatus()
  }

  useEffect(() => {
    loadQueueData()
  }, [statusFilter, printerFilter])

  useEffect(() => {
    loadPrinterStatus()
  }, [])

  // Fetch printer storage files when selected printer changes in modal
  useEffect(() => {
    if (sourceType === 'printer' && selectedPrinterIp) {
      setLoadingPrinterFiles(true)
      api
        .getPrinterFiles(selectedPrinterIp)
        .then((data) => {
          const files = data.files || []
          setPrinterFiles(files)
          if (files.length > 0) {
            setSelectedPrinterFilePath(files[0].path || files[0].filename || files[0].name)
          } else {
            setSelectedPrinterFilePath('')
          }
        })
        .catch((err) => {
          onNotify?.(`Failed to fetch files for ${selectedPrinterIp}: ${err.message}`, 'error')
          setPrinterFiles([])
          setSelectedPrinterFilePath('')
        })
        .finally(() => {
          setLoadingPrinterFiles(false)
        })
    }
  }, [sourceType, selectedPrinterIp])

  const handleDispatch = (item) => {
    setConfirmConfig({
      action: () => executeDispatch(item),
      title: 'Dispatch Job',
      message: `Are you sure you want to dispatch Job #${item.id} to printer ${item.printer_ip}?`,
      isDanger: false
    })
  }

  const executeDispatch = async (item) => {
    setDispatchingId(item.id)
    try {
      await api.dispatchQueueItem(item.id)
      onNotify?.(`Dispatched Job #${item.id} (${item.gcode_file?.filename || 'File'}) to printer ${item.printer_ip}`)
      loadData()
    } catch (err) {
      onNotify?.(`Dispatch failed: ${err.message}`, 'error')
    } finally {
      setDispatchingId(null)
    }
  }

  const handleDelete = (id) => {
    setConfirmConfig({
      action: () => executeDelete(id),
      title: 'Remove Job',
      message: `Are you sure you want to remove item #${id} from the queue?`,
      isDanger: true
    })
  }

  const executeDelete = async (id) => {
    try {
      await api.deleteQueueItem(id)
      onNotify?.(`Removed item #${id} from print queue`)
      loadData()
    } catch (err) {
      onNotify?.(`Delete failed: ${err.message}`, 'error')
    }
  }

  const handleOpenEdit = (item) => {
    setEditItem(item)
    setEditPriority(item.priority || 1)
    setEditStatus(item.status || 'queued')
    setEditPrinterIp(item.printer_ip || '')
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editItem) return
    setUpdating(true)
    try {
      await api.updateQueueItem(editItem.id, {
        priority: Number(editPriority),
        status: editStatus,
        printer_ip: editPrinterIp || null,
      })
      onNotify?.(`Updated Queue Item #${editItem.id}`)
      setEditItem(null)
      loadData()
    } catch (err) {
      onNotify?.(`Update failed: ${err.message}`, 'error')
    } finally {
      setUpdating(false)
    }
  }

  const handleOpenSchedule = async () => {
    try {
      const data = await api.listGCodeFiles()
      setGcodeFiles(data.files || [])
      if (data.files?.length > 0) setSelectedFileId(data.files[0].id)

      if (printersQueueStatus.length > 0) {
        setSelectedPrinterIp(printersQueueStatus[0].ip)
      }

      setSourceType('local')
      setScheduleModalOpen(true)
    } catch (err) {
      onNotify?.(`Failed to list G-code files: ${err.message}`, 'error')
    }
  }

  const handleScheduleJob = (e) => {
    e.preventDefault()
    setConfirmConfig({
      action: executeScheduleJob,
      title: 'Schedule Job',
      message: 'Are you sure you want to schedule this job to the queue?',
      isDanger: false
    })
  }

  const executeScheduleJob = async () => {
    setScheduling(true)
    try {
      if (sourceType === 'local') {
        if (!selectedFileId) return
        await api.schedulePrintQueue([
          { 
            gcode_file_id: Number(selectedFileId), 
            priority: Number(schedulePriority),
            printer_ip: localTargetPrinter || null
          },
        ])
        onNotify?.('Scheduled local G-code file into queue')
      } else {
        if (!selectedPrinterIp || !selectedPrinterFilePath) return
        const selectedObj = printerFiles.find(
          (f) => (f.path || f.filename || f.name) === selectedPrinterFilePath
        )
        const name = selectedObj?.filename || selectedObj?.name || selectedPrinterFilePath.split('/').pop()

        await api.schedulePrintQueue([
          {
            printer_ip: selectedPrinterIp,
            printer_file_path: selectedPrinterFilePath,
            filename: name,
            priority: Number(schedulePriority),
          },
        ])
        onNotify?.(`Scheduled printer file '${name}' into queue`)
      }

      setScheduleModalOpen(false)
      loadData()
    } catch (err) {
      onNotify?.(`Scheduling failed: ${err.message}`, 'error')
    } finally {
      setScheduling(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Jobs & Queue</span>
          </div>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Print Queue Management</h2>
          <p className="mt-1 text-sm text-slate-500">
            Schedule prioritized G-code files from server library or printer storage, auto-calculate ETAs, and dispatch jobs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={loadData} disabled={loading} className="secondary-button">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button onClick={handleOpenSchedule} className="primary-button">
            <Plus size={15} />
            Schedule New Job
          </button>
        </div>
      </div>

      {/* Printer Workload Cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {printersQueueStatus.map((p, idx) => {
          const norm = normalizePrinter(p, idx)
          const name = norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
          return (
            <div key={p.ip} className="panel p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`printer-icon ${norm.color || 'orange'}`}>
                    <Printer size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{name}</h4>
                    <p className="font-mono text-[10px] text-slate-400">{p.ip}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    p.available ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {p.available ? 'Available' : 'Busy'}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="text-slate-400">Remaining time:</span>
                <span className="font-bold text-slate-800">
                  {formatDuration(p.remaining_time_seconds ?? p.remaining_sec ?? p.details?.printLeftTime)}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">Assigned queue jobs:</span>
                <span className="font-bold text-slate-800">{p.assigned_queue_jobs?.length || 0} job(s)</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filter Bar */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="assigned">Assigned</option>
              <option value="printing">Printing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Printer IP:</span>
            <select
              value={printerFilter}
              onChange={(e) => setPrinterFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            >
              <option value="">All printers</option>
              {printersQueueStatus.map((p, idx) => {
                const norm = normalizePrinter(p, idx)
                const baseName = norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
                return (
                  <option key={p.ip} value={p.ip}>
                    {baseName} ({p.ip})
                  </option>
                )
              })}
            </select>
          </div>

          <div className="ml-auto text-xs font-semibold text-slate-400">{queue.length} queue item(s)</div>
        </div>
      </div>

      {/* Queue Items Table */}
      <div className="panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading queue items...</div>
        ) : queue.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <Clock size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-bold text-slate-700">No print jobs in queue</p>
            <p className="mt-1 text-xs text-slate-400">Click "Schedule New Job" to add G-code files to the queue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                <tr>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">G-Code File</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Printer</th>
                  <th className="py-3 px-4">Est. Completion</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {queue.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-orange-100 text-orange-700 font-bold">
                        #{item.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-800">{item.gcode_file?.filename || `File #${item.gcode_file_id}`}</p>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {item.gcode_file?.folder ? `${item.gcode_file.folder} / ${item.gcode_file.size}` : `Item #${item.id}`}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge state={item.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {item.printer_ip ? (
                        <div>
                          <p className="font-bold text-xs text-slate-800">
                            {(() => {
                              const matchingPrinter = printersQueueStatus.find((p) => p.ip === item.printer_ip)
                              if (!matchingPrinter) return 'Printer'
                              const norm = normalizePrinter(matchingPrinter, 0)
                              return norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
                            })()}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">{item.printer_ip}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-sans italic text-xs">Auto-assign</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {item.estimated_completion_time || item.estimated_completion
                        ? new Date(item.estimated_completion_time || item.estimated_completion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {['assigned', 'queued'].includes(item.status) && (
                          <button
                            onClick={() => handleDispatch(item)}
                            disabled={dispatchingId === item.id || !item.printer_ip}
                            className="primary-button py-1 px-2.5 text-[11px]"
                            title={!item.printer_ip ? 'Assign a printer first' : 'Dispatch job to printer'}
                          >
                            <Send size={12} className={dispatchingId === item.id ? 'spin' : ''} />
                            {dispatchingId === item.id ? 'Dispatching...' : 'Dispatch'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="icon-button h-7 w-7"
                          title="Edit priority or status"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="icon-button h-7 w-7 text-red-500 hover:border-red-200 hover:bg-red-50"
                          title="Delete queue item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Queue Item Modal */}
      {editItem && (
        <div className="modal-backdrop" role="presentation">
          <div className="details-modal max-w-md">
            <div className="border-b border-slate-100 p-5 font-bold">Edit Queue Item #{editItem.id}</div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Priority (1 = Highest)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                >
                  <option value="queued">Queued</option>
                  <option value="assigned">Assigned</option>
                  <option value="printing">Printing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Printer IP</label>
                <select
                  value={editPrinterIp}
                  onChange={(e) => setEditPrinterIp(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                >
                  <option value="">Auto-assign</option>
                  {printersQueueStatus.map((p, idx) => {
                    const norm = normalizePrinter(p, idx)
                    const baseName = norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
                    return (
                      <option key={p.ip} value={p.ip}>
                        {baseName} ({p.ip})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditItem(null)} className="secondary-button">
                  Cancel
                </button>
                <button type="submit" disabled={updating} className="primary-button">
                  {updating ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {scheduleModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="details-modal max-w-md">
            <div className="border-b border-slate-100 p-5 font-bold">Schedule Job to Print Queue</div>

            {/* Source selection tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 px-5 pt-3">
              <button
                type="button"
                onClick={() => setSourceType('local')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
                  sourceType === 'local'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                Local G-Code Library
              </button>
              <button
                type="button"
                onClick={() => setSourceType('printer')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
                  sourceType === 'printer'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                Printer Storage
              </button>
            </div>

            <form onSubmit={handleScheduleJob} className="p-5 space-y-4">
              {sourceType === 'local' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Server G-Code File</label>
                    <select
                      value={selectedFileId}
                      onChange={(e) => setSelectedFileId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                    >
                      {gcodeFiles.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.filename} ({f.folder} / {f.size})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Target Printer</label>
                    <select
                      value={localTargetPrinter}
                      onChange={(e) => setLocalTargetPrinter(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                    >
                      <option value="">🤖 Auto-assign (Fastest Available)</option>
                      {printersQueueStatus.map((p, idx) => {
                        const norm = normalizePrinter(p, idx)
                        const baseName = norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
                        const statusText = p.available 
                          ? '✅ Available Now' 
                          : `⏳ Busy (Done in ${formatDuration(p.remaining_time_seconds || p.remaining_sec || 0)})`
                        
                        return (
                          <option key={p.ip} value={p.ip}>
                            {baseName} ({p.ip}) — {statusText}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Target Printer</label>
                    <select
                      value={selectedPrinterIp}
                      onChange={(e) => setSelectedPrinterIp(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                    >
                      {printersQueueStatus.map((p, idx) => {
                        const norm = normalizePrinter(p, idx)
                        const baseName = norm.name ? norm.name.split('—')[0].trim() : 'Creality Printer'
                        const statusText = p.available 
                          ? 'Available Now' 
                          : `Busy (${formatDuration(p.remaining_time_seconds || p.remaining_sec || 0)})`
                          
                        return (
                          <option key={p.ip} value={p.ip}>
                            {baseName} ({p.ip}) — {statusText}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Printer File</label>
                    {loadingPrinterFiles ? (
                      <p className="text-xs text-slate-400 py-2">Loading printer files...</p>
                    ) : printerFiles.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">No files found on this printer's storage.</p>
                    ) : (
                      <select
                        value={selectedPrinterFilePath}
                        onChange={(e) => setSelectedPrinterFilePath(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                      >
                        {printerFiles.map((pf, idx) => {
                          const val = pf.path || pf.filename || pf.name
                          const label = pf.filename || pf.name || pf.path
                          return (
                            <option key={idx} value={val}>
                              {label}
                            </option>
                          )
                        })}
                      </select>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Priority (1 = Highest)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={schedulePriority}
                  onChange={(e) => setSchedulePriority(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setScheduleModalOpen(false)} className="secondary-button">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    scheduling ||
                    (sourceType === 'local' && !selectedFileId) ||
                    (sourceType === 'printer' && (!selectedPrinterIp || !selectedPrinterFilePath))
                  }
                  className="primary-button"
                >
                  {scheduling ? 'Scheduling...' : 'Schedule Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title}
        message={confirmConfig?.message}
        confirmText="Yes, continue"
        isDanger={confirmConfig?.isDanger}
        onConfirm={() => confirmConfig && confirmConfig.action()}
        onCancel={() => setConfirmConfig(null)}
      />
    </div>
  )
}
