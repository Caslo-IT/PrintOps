import React, { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle, Info, RefreshCw } from 'lucide-react'
import { api } from '../../services/api'

let cachedLogs = []
let hasCachedLogs = false

export function ActivityLogWorkspace({ onNotify }) {
  const [logs, setLogs] = useState(cachedLogs)
  const [loading, setLoading] = useState(!hasCachedLogs)
  const [error, setError] = useState(null)

  const fetchLogs = useCallback(async (isBackground = false) => {
    if (!isBackground && !hasCachedLogs) setLoading(true)
    try {
      const data = await api.getActivityLogs(100)
      cachedLogs = Array.isArray(data) ? data : []
      hasCachedLogs = true
      setLogs(cachedLogs)
      setError(null)
    } catch (err) {
      setError(`Failed to load activity logs: ${err.message}`)
      if (!isBackground && onNotify) {
        onNotify('Could not fetch activity logs', 'error')
      }
    } finally {
      if (!isBackground) setLoading(false)
    }
  }, [onNotify])

  useEffect(() => {
    fetchLogs()

    // Auto-refresh logs every 10 seconds
    const interval = setInterval(() => {
      fetchLogs(true)
    }, 10000)
    
    return () => clearInterval(interval)
  }, [fetchLogs])

  const getEventIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-emerald-500" size={16} />
      case 'warning':
        return <AlertTriangle className="text-orange-500" size={16} />
      case 'error':
        return <AlertTriangle className="text-red-500" size={16} />
      case 'info':
      default:
        return <Info className="text-blue-500" size={16} />
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Activity Log</span>
          </div>
          <h2 className="mt-3 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">System Activity</h2>
          <p className="mt-1 text-sm text-slate-500">Monitor all printer events and queue activity.</p>
        </div>
        <button onClick={() => fetchLogs(false)} disabled={loading} className="primary-button">
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {logs.length === 0 && !loading && !error ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <Activity size={32} className="mx-auto mb-3 opacity-20" />
            No activity logs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-xs text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Event</th>
                  <th className="px-6 py-4 font-medium">Message</th>
                  <th className="px-6 py-4 font-medium">Printer IP</th>
                  <th className="px-6 py-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2 font-medium capitalize text-slate-700">
                        {getEventIcon(log.event_type)}
                        {log.event_type}
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-slate-700">
                      {log.message}
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {log.printer_name || log.printer_ip || '—'}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-400">
                      {formatTime(log.created_at)}
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
