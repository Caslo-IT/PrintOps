import React, { useEffect, useState } from 'react'
import { Calendar, Clock, Download, FileText, Folder, FolderPlus, Layers, Plus, RefreshCw, Trash2, Upload, Zap } from 'lucide-react'
import { formatDuration, formatTemperature } from '../../data/printers'
import { api } from '../../services/api'
import { ConfirmModal } from '../common/ConfirmModal'

const SIZE_OPTIONS = ['1ft', '1.5ft', '2ft', '2.5ft', '3ft', '3.5ft', '4ft', '4.5ft', '5ft', '5.5ft', '6ft']

let cachedFolders = []
let cachedFiles = []
let cachedSelectedFolder = ''
let cachedSelectedSize = ''
let hasCachedStorageData = false

export function GCodeStorageWorkspace({ onNotify, onNavigateToQueue }) {
  const [folders, setFolders] = useState(cachedFolders)
  const [files, setFiles] = useState(cachedFiles)
  const [loading, setLoading] = useState(!hasCachedStorageData)
  const [selectedFolder, setSelectedFolder] = useState(cachedSelectedFolder)
  const [selectedSize, setSelectedSize] = useState(cachedSelectedSize)
  const [searchQuery, setSearchQuery] = useState('')

  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadFolder, setUploadFolder] = useState('')
  const [uploadSize, setUploadSize] = useState('1ft')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

  const [scheduleModalItem, setScheduleModalItem] = useState(null)
  const [schedulePriority, setSchedulePriority] = useState(1)
  const [scheduling, setScheduling] = useState(false)

  const loadData = async () => {
    if (!hasCachedStorageData) setLoading(true)
    try {
      const [foldersData, filesData] = await Promise.all([
        api.listGCodeFolders(),
        api.listGCodeFiles(selectedFolder, selectedSize),
      ])
      
      cachedFolders = foldersData.folders || []
      cachedFiles = filesData.files || []
      cachedSelectedFolder = selectedFolder
      cachedSelectedSize = selectedSize
      hasCachedStorageData = true
      
      setFolders(cachedFolders)
      setFiles(cachedFiles)
    } catch (err) {
      onNotify?.(`Failed to load storage data: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedFolder, selectedSize])

  const handleCreateFolder = async (e) => {
    e.preventDefault()
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      const created = await api.createGCodeFolder(newFolderName.trim())
      onNotify?.(`Folder '${created.folder}' created with size subfolders`)
      setNewFolderName('')
      setCreateFolderModalOpen(false)
      loadData()
    } catch (err) {
      onNotify?.(`Failed to create folder: ${err.message}`, 'error')
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!uploadFile || !uploadFolder || !uploadSize) {
      onNotify?.('Please select a folder, size, and G-code file', 'error')
      return
    }
    setUploading(true)
    try {
      const res = await api.uploadGCodeFile(uploadFolder, uploadSize, uploadFile)
      onNotify?.(`G-code file ${res.filename} saved and parsed successfully!`)
      setUploadFile(null)
      setUploadModalOpen(false)
      loadData()
    } catch (err) {
      onNotify?.(`Upload failed: ${err.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = (id, filename) => {
    setConfirmConfig({
      action: () => executeDelete(id, filename),
      title: 'Delete File',
      message: `Are you sure you want to delete ${filename}?`,
      isDanger: true
    })
  }

  const executeDelete = async (id, filename) => {
    try {
      await api.deleteGCodeFile(id)
      onNotify?.(`Deleted ${filename}`)
      loadData()
    } catch (err) {
      onNotify?.(`Failed to delete: ${err.message}`, 'error')
    }
  }

  const handleScheduleQueue = (e) => {
    e.preventDefault()
    if (!scheduleModalItem) return
    setConfirmConfig({
      action: executeScheduleQueue,
      title: 'Schedule Job',
      message: `Are you sure you want to schedule ${scheduleModalItem.filename} to the print queue?`,
      isDanger: false
    })
  }

  const executeScheduleQueue = async () => {
    setScheduling(true)
    try {
      await api.schedulePrintQueue([
        { gcode_file_id: scheduleModalItem.id, priority: Number(schedulePriority) },
      ])
      onNotify?.(`Scheduled ${scheduleModalItem.filename} to print queue`)
      setScheduleModalItem(null)
      if (onNavigateToQueue) onNavigateToQueue()
    } catch (err) {
      onNotify?.(`Failed to schedule: ${err.message}`, 'error')
    } finally {
      setScheduling(false)
    }
  }

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const visibleFiles = normalizedSearch
    ? files.filter((file) => [file.filename, file.folder, file.size]
      .some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
    : files

  const filesByFolder = visibleFiles.reduce((groups, file) => {
    const folder = file.folder || 'Unfiled G-code'
    const size = file.size || 'Uncategorized'
    if (!groups[folder]) groups[folder] = {}
    if (!groups[folder][size]) groups[folder][size] = []
    groups[folder][size].push(file)
    return groups
  }, {})

  const renderFileCard = (file) => {
    const analysis = file.analysis || {}
    return (
      <div key={file.id} className="panel flex flex-col justify-between p-5 transition-shadow hover:shadow-md">
        <div>
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-bold text-orange-600">
              {file.size}
            </span>
            <button
              onClick={() => handleDelete(file.id, file.filename)}
              className="text-slate-300 hover:text-red-600"
              title="Delete file"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <h3 className="mt-3 truncate text-sm font-bold text-slate-900" title={file.filename}>
            {file.filename}
          </h3>
          <p className="mt-1 text-[11px] font-mono text-slate-400">
            ID #{file.id} · {file.file_size_bytes ? `${(file.file_size_bytes / 1024 / 1024).toFixed(2)} MB` : 'Local file'}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400">Est. Duration</span>
              <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Clock size={12} className="text-orange-500" />
                {formatDuration(analysis.total_time_sec)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Total Layers</span>
              <p className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                <Layers size={12} className="text-blue-500" />
                {analysis.layer_count ? `${analysis.layer_count} layers` : '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Filament Used</span>
              <p className="font-bold text-slate-800 mt-0.5">
                {analysis.total_filament_m ? `${analysis.total_filament_m}m (${analysis.total_weight_g || 0}g)` : '—'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400">Filament Spec</span>
              <p className="font-bold text-slate-800 mt-0.5">1.75mm · 1.10g/cm³</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <a
            href={api.getGCodeDownloadUrl(file.id)}
            target="_blank"
            rel="noreferrer"
            className="secondary-button flex-1 text-xs"
            title="Download G-code"
          >
            <Download size={13} />
            Download
          </a>
          <button
            onClick={() => {
              setScheduleModalItem(file)
              setSchedulePriority(1)
            }}
            className="primary-button text-xs"
          >
            <Zap size={13} />
            Schedule
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">G-Code Storage</span>
          </div>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Local G-Code Library</h2>
          <p className="mt-1 text-sm text-slate-500">
            Organized local G-code storage with PostgreSQL parsed print metrics & layer analysis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCreateFolderModalOpen(true)} className="secondary-button">
            <FolderPlus size={15} />
            New folder
          </button>
          <button
            onClick={() => {
              if (folders.length > 0) setUploadFolder(folders[0].folder)
              setUploadModalOpen(true)
            }}
            className="primary-button"
          >
            <Upload size={15} />
            Upload G-code
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Folder:</span>
            <select
              value={selectedFolder}
              onChange={(e) => setSelectedFolder(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            >
              <option value="">All folders ({folders.length})</option>
              {folders.map((f) => (
                <option key={f.folder} value={f.folder}>
                  {f.folder}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Search:</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="File or folder name"
              className="w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 outline-none placeholder:text-slate-400 focus:border-orange-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Size:</span>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none"
            >
              <option value="">All sizes</option>
              {SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadData} disabled={loading} className="icon-button" title="Refresh files">
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
            <span className="text-xs font-semibold text-slate-400">{visibleFiles.length} G-code file(s) found</span>
          </div>
        </div>
      </div>

      {/* Files List / Grid */}
      {loading ? (
        <div className="panel p-12 text-center text-sm text-slate-400">Loading stored G-code files...</div>
      ) : visibleFiles.length === 0 ? (
        <div className="panel p-12 text-center text-sm text-slate-500">
          <FileText size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="font-bold text-slate-700">No G-code files found</p>
          <p className="mt-1 text-xs text-slate-400">{normalizedSearch ? 'Try a different file, folder, or size search.' : 'Upload G-code files into structured folders to parse print metrics.'}</p>
        </div>
      ) : (
        <div className="space-y-7">
          {Object.entries(filesByFolder).map(([folder, filesBySize]) => {
            const folderFileCount = Object.values(filesBySize).reduce(
              (count, sizeFiles) => count + sizeFiles.length,
              0,
            )
            const sortedSizeFolders = Object.entries(filesBySize).sort(
              ([firstSize], [secondSize]) => {
                const firstIndex = SIZE_OPTIONS.indexOf(firstSize)
                const secondIndex = SIZE_OPTIONS.indexOf(secondSize)
                return (firstIndex === -1 ? SIZE_OPTIONS.length : firstIndex) -
                  (secondIndex === -1 ? SIZE_OPTIONS.length : secondIndex)
              },
            )

            return (
            <section key={folder} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Folder size={18} className="shrink-0 text-orange-500" />
                  <h3 className="truncate text-sm font-bold text-slate-800">{folder}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  {folderFileCount} file{folderFileCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="space-y-5">
                {sortedSizeFolders.map(([size, sizeFiles]) => (
                  <div key={size} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Folder size={15} className="text-sky-500" />
                        <h4 className="text-xs font-bold text-slate-700">{size}</h4>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400">
                        {sizeFiles.length} file{sizeFiles.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                      {sizeFiles.map(renderFileCard)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )
          })}
        </div>
      )}

      {/* Create Folder Modal */}
      {createFolderModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="details-modal max-w-md">
            <div className="border-b border-slate-100 p-5 font-bold">Create New Storage Folder</div>
            <form onSubmit={handleCreateFolder} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Folder Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. customer-job-001"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Subfolders for sizes 1ft through 6ft will be generated automatically.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setCreateFolderModalOpen(false)} className="secondary-button">
                  Cancel
                </button>
                <button type="submit" disabled={creatingFolder} className="primary-button">
                  {creatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload File Modal */}
      {uploadModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="details-modal max-w-md">
            <div className="border-b border-slate-100 p-5 font-bold">Upload Local G-Code File</div>
            <form onSubmit={handleUpload} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Storage Folder</label>
                <select
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                >
                  {folders.map((f) => (
                    <option key={f.folder} value={f.folder}>
                      {f.folder}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Size Category</label>
                <select
                  value={uploadSize}
                  onChange={(e) => setUploadSize(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:border-orange-500"
                >
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">G-Code File</label>
                <input
                  type="file"
                  required
                  accept=".gcode,.gco,.g"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-600 hover:file:bg-orange-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setUploadModalOpen(false)} className="secondary-button">
                  Cancel
                </button>
                <button type="submit" disabled={uploading || !uploadFile} className="primary-button">
                  {uploading ? 'Uploading & Analyzing...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Schedule Job Modal */}
      {scheduleModalItem && (
        <div className="modal-backdrop" role="presentation">
          <div className="details-modal max-w-md">
            <div className="border-b border-slate-100 p-5 font-bold">Schedule File to Queue</div>
            <form onSubmit={handleScheduleQueue} className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">File to schedule:</p>
                <p className="text-sm font-bold text-slate-800 truncate mt-1">{scheduleModalItem.filename}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Folder: {scheduleModalItem.folder} · Size: {scheduleModalItem.size}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Job Priority (1 = Highest)</label>
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
                <button type="button" onClick={() => setScheduleModalItem(null)} className="secondary-button">
                  Cancel
                </button>
                <button type="submit" disabled={scheduling} className="primary-button">
                  {scheduling ? 'Scheduling...' : 'Confirm Schedule'}
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
