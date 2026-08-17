import React, { useEffect, useState } from 'react'
import { HardDrive, Play, Upload, X, Zap } from 'lucide-react'
import { api } from '../../services/api'
import { ConfirmModal } from '../common/ConfirmModal'

export function PrinterStorageModal({ printer, onClose, onNotify }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [startingPath, setStartingPath] = useState('')
  const [schedulingPath, setSchedulingPath] = useState('')
  const [confirmConfig, setConfirmConfig] = useState(null)

  const fetchFiles = async () => {
    if (!printer) return
    setLoading(true)
    setError('')
    try {
      const data = await api.getPrinterFiles(printer.ip)
      setFiles(data.files || [])
    } catch (err) {
      setError(err.message || 'Failed to load files from printer storage')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles()
  }, [printer?.ip])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      await api.uploadPrinterFile(printer.ip, file)
      onNotify?.(`Uploaded ${file.name} to printer ${printer.name}`)
      fetchFiles()
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleStartPrint = (fileObj) => {
    const path = fileObj.path || fileObj.filename || fileObj.name
    setConfirmConfig({
      action: () => executeStartPrint(path, fileObj),
      title: 'Start Print',
      message: `Are you sure you want to start printing ${path} on ${printer.name}?`,
      isDanger: false
    })
  }

  const executeStartPrint = async (path, fileObj) => {
    setStartingPath(path)
    try {
      await api.startPrinterPrint(printer.ip, path)
      onNotify?.(`Print started on ${printer.name}: ${fileObj.filename || fileObj.name}`)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to start print')
    } finally {
      setStartingPath('')
    }
  }

  const handleScheduleQueue = (fileObj) => {
    const path = fileObj.path || fileObj.filename || fileObj.name
    const name = fileObj.filename || fileObj.name || path.split('/').pop()
    setConfirmConfig({
      action: () => executeScheduleQueue(path, name),
      title: 'Schedule Job',
      message: `Are you sure you want to schedule ${name} to the print queue?`,
      isDanger: false
    })
  }

  const executeScheduleQueue = async (path, name) => {
    setSchedulingPath(path)
    try {
      await api.schedulePrintQueue([
        {
          printer_ip: printer.ip,
          printer_file_path: path,
          filename: name,
          priority: 1,
        },
      ])
      onNotify?.(`Scheduled ${name} from ${printer.name} storage to queue!`)
    } catch (err) {
      setError(err.message || 'Failed to schedule into queue')
    } finally {
      setSchedulingPath('')
    }
  }

  if (!printer) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="details-modal" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <HardDrive size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-[-.03em]">Printer Storage — {printer.name}</h2>
              <p className="text-xs text-slate-500">Manage, launch, or queue prints directly from {printer.ip}</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs font-medium text-red-600">{error}</div>}

          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Stored G-code Files</p>
              <p className="text-xs text-slate-500">{files.length} file(s) available on internal storage</p>
            </div>
            <label className="primary-button cursor-pointer">
              <Upload size={15} />
              {uploading ? 'Uploading...' : 'Upload G-code to Printer'}
              <input type="file" accept=".gcode,.gco,.g" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading files from printer...</div>
          ) : files.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
              No G-code files found on this printer's storage.
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {files.map((item, idx) => {
                const itemPath = item.path || item.filename || item.name
                return (
                  <div key={idx} className="flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50">
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="truncate text-xs font-bold text-slate-800">{item.filename || item.name || item.path}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400 font-mono">
                        {item.size ? `${(item.size / 1024 / 1024).toFixed(2)} MB` : item.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleScheduleQueue(item)}
                        disabled={schedulingPath === itemPath}
                        className="secondary-button py-1.5 px-3 text-xs hover:border-orange-200 hover:text-orange-600"
                        title="Add this file to print queue"
                      >
                        <Zap size={13} />
                        {schedulingPath === itemPath ? 'Queueing...' : 'Queue'}
                      </button>
                      <button
                        onClick={() => handleStartPrint(item)}
                        disabled={startingPath === itemPath}
                        className="primary-button py-1.5 px-3 text-xs"
                      >
                        <Play size={13} />
                        {startingPath === itemPath ? 'Starting...' : 'Print Now'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 p-4">
          <button className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      
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
