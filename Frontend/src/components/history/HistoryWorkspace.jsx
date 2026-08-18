import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw, FileText, Printer } from 'lucide-react'
import { api } from '../../services/api'

let cachedHistory = []
let hasCachedHistory = false

export function HistoryWorkspace({ onNotify }) {
  const [history, setHistory] = useState(cachedHistory)
  const [loading, setLoading] = useState(!hasCachedHistory)
  const [error, setError] = useState(null)

  const fetchHistory = useCallback(async (isBackground = false) => {
    if (!isBackground && !hasCachedHistory) setLoading(true)
    try {
      const data = await api.getPrintHistory(100)
      cachedHistory = Array.isArray(data.history) ? data.history : []
      hasCachedHistory = true
      setHistory(cachedHistory)
      setError(null)
    } catch (err) {
      setError(`Failed to load print history: ${err.message}`)
      if (!isBackground && onNotify) {
        onNotify('Could not fetch print history', 'error')
      }
    } finally {
      if (!isBackground) setLoading(false)
    }
  }, [onNotify])

  useEffect(() => {
    fetchHistory()

    // Auto-refresh history every 5 seconds
    const interval = setInterval(() => {
      fetchHistory(true)
    }, 5000)
    
    return () => clearInterval(interval)
  }, [fetchHistory])

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="text-emerald-500" size={16} />
      case 'printing':
        return <RefreshCw className="text-blue-500" size={16} />
      case 'error':
        return <AlertTriangle className="text-red-500" size={16} />
      case 'stopped':
      case 'cancelled':
        return <XCircle className="text-orange-500" size={16} />
      default:
        return <Clock className="text-slate-500" size={16} />
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Completed'
      case 'printing': return 'Printing'
      case 'error': return 'Error'
      case 'stopped': return 'Stopped'
      default: return status || 'Unknown'
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return '—'
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const calculateDuration = (start, end) => {
    if (!start || !end) return '—'
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const diff = endTime - startTime
    
    if (diff <= 0) return '—'
    
    const minutes = Math.floor(diff / 1000 / 60)
    if (minutes < 60) return `${minutes}m`
    
    const hours = Math.floor(minutes / 60)
    const remMins = minutes % 60
    return `${hours}h ${remMins}m`
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Print History</span>
          </div>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Print History</h2>
          <p className="mt-1 text-sm text-slate-500">A historical record of all completed, stopped, and failed print jobs.</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {history.length === 0 && !loading && !error ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <Clock size={32} className="mx-auto mb-3 opacity-20" />
            No print history found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">File</th>
                  <th className="px-6 py-4 font-medium">Printer</th>
                  <th className="px-6 py-4 font-medium">Start Time</th>
                  <th className="px-6 py-4 font-medium">End Time</th>
                  <th className="px-6 py-4 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2 font-medium text-slate-700">
                        {getStatusIcon(record.status)}
                        {getStatusLabel(record.status)}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        <span className="truncate max-w-[200px]" title={record.filename}>
                          {record.filename || 'Unknown File'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Printer size={14} className="text-slate-400" />
                        {record.printer_name || record.printer_ip || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">
                      {formatTime(record.start_time)}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-500">
                      {formatTime(record.end_time)}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {calculateDuration(record.start_time, record.end_time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
