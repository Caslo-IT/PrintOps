import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, CircleAlert, Droplets, PlayCircle, Printer, RefreshCw } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { api } from '../../services/api'

export function PrinterMonitorWorkspace({ printers, filaments, scanning, onScan, lastUpdated }) {
  const [activity, setActivity] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => new Set())

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const logs = await api.getActivityLogs(12)
        setActivity(Array.isArray(logs) ? logs : [])
      } catch {
        // Keep the most recently loaded notifications visible.
      }
    }

    loadNotifications()
    const intervalId = setInterval(loadNotifications, 10000)
    return () => clearInterval(intervalId)
  }, [])

  const filamentByPrinter = useMemo(() => {
    const assigned = new Map()
    filaments.forEach((filament) => {
      const identifier = filament.assigned_printer_name
      if (!identifier || assigned.has(identifier)) return
      assigned.set(identifier, filament)
      if (filament.printer_ip) assigned.set(filament.printer_ip, filament)
    })
    return assigned
  }, [filaments])

  const notifications = useMemo(() => {
    const lowFilament = filaments
      .filter((filament) => {
        const remaining = filament.live_remaining_weight_g ?? filament.remaining_weight_g
        return Number(filament.total_weight_g) > 0 && Number(remaining) / Number(filament.total_weight_g) <= 0.15
      })
      .map((filament) => ({
        id: `filament-${filament.id}`,
        type: 'filament',
        title: 'Low filament',
        message: `${filament.name}: ${Math.round(filament.live_remaining_weight_g ?? filament.remaining_weight_g)}g remaining`,
        createdAt: null,
      }))

    return [...lowFilament, ...activity.map((log) => ({
      id: `activity-${log.id}`,
      type: notificationType(log),
      title: notificationTitle(log),
      message: `${log.printer_name || log.printer_ip || 'Printer'} · ${log.message}`,
      createdAt: log.created_at,
    }))]
      .filter((notification) => !dismissedNotificationIds.has(notification.id))
      .slice(0, 12)
  }, [activity, dismissedNotificationIds, filaments])

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Workspace</span>
            <span>/</span>
            <span className="font-medium text-slate-900">Monitor</span>
          </div>
        </div>
        <div className="monitor-actions">
          <button onClick={() => setNotificationsOpen((open) => !open)} className="secondary-button" aria-expanded={notificationsOpen}>
            <Bell size={16} />
            Notifications
            {notifications.length > 0 && <span className="monitor-notification-count">{notifications.length}</span>}
          </button>
          {notificationsOpen && <section className="monitor-notification-popover" aria-label="Printer notifications">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">Live printer events and warnings</p>
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && <button onClick={() => setDismissedNotificationIds((ids) => new Set([...ids, ...notifications.map((notification) => notification.id)]))} className="monitor-clear-button">Clear</button>}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{notifications.length}</span>
              </div>
            </div>
            {notifications.length ? (
              <div className="monitor-notification-list">
                {notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} />)}
              </div>
            ) : (
              <p className="py-7 text-center text-xs text-slate-400">No recent printer notifications.</p>
            )}
          </section>}
          <button onClick={onScan} disabled={scanning} className="primary-button">
            <RefreshCw size={16} className={scanning ? 'spin' : ''} />
            {scanning ? 'Refreshing...' : 'Refresh monitor'}
          </button>
        </div>
      </div>

      {printers.length ? (
        <section className="monitor-panel" aria-label="Printer monitoring grid">
          <div className="monitor-grid">
            {printers.slice(0, 10).map((printer) => (
              <MonitorTile
                key={printer.ip}
                printer={printer}
                filament={filamentByPrinter.get(printer.name) || filamentByPrinter.get(printer.ip)}
              />
            ))}
          </div>
          {printers.length > 10 && (
            <p className="mt-4 text-xs text-slate-400">Showing the first 10 of {printers.length} printers.</p>
          )}
        </section>
      ) : (
        <div className="panel p-12 text-center text-sm text-slate-500">No printers found. Refresh the monitor after printers are available.</div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-2"><i className="live-dot" />Auto-sync every 10 seconds</span>
        <span>Last synced {lastUpdated}</span>
      </div>
    </>
  )
}

function notificationType(log) {
  const message = (log.message || '').toLowerCase()
  if (log.event_type === 'error' || message.includes('error')) return 'error'
  if (message.includes('completed')) return 'complete'
  if (message.includes('started')) return 'start'
  return 'info'
}

function notificationTitle(log) {
  const type = notificationType(log)
  return type === 'error' ? 'Print error' : type === 'complete' ? 'Print complete' : type === 'start' ? 'Print started' : 'Printer update'
}

function NotificationItem({ notification }) {
  const config = {
    error: { icon: <CircleAlert size={16} />, className: 'error' },
    complete: { icon: <CheckCircle2 size={16} />, className: 'complete' },
    start: { icon: <PlayCircle size={16} />, className: 'start' },
    filament: { icon: <Droplets size={16} />, className: 'filament' },
    info: { icon: <AlertTriangle size={16} />, className: 'info' },
  }[notification.type]

  return (
    <div className="monitor-notification-item">
      <span className={`monitor-notification-icon ${config.className}`}>{config.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800">{notification.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500" title={notification.message}>{notification.message}</p>
      </div>
      {notification.createdAt && <time className="shrink-0 text-[10px] text-slate-400">{new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
    </div>
  )
}

function MonitorTile({ printer, filament }) {
  const remaining = filament?.live_remaining_weight_g ?? filament?.remaining_weight_g
  const progress = Math.max(0, Math.min(100, Number(printer.progress) || 0))
  const totalFilament = Number(filament?.total_weight_g)
  const filamentProgress = Number.isFinite(Number(remaining)) && Number.isFinite(totalFilament) && totalFilament > 0
    ? Math.max(0, Math.min(100, (Number(remaining) / totalFilament) * 100))
    : null

  return (
    <article className="monitor-tile">
      <div className="flex min-w-0 items-start gap-2">
        <span className={`monitor-printer-icon ${printer.color || 'orange'}`}><Printer size={15} /></span>
        <div className="min-w-0">
          <h3 className="truncate text-xs font-bold text-slate-800" title={printer.name}>{printer.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{printer.ip}</p>
        </div>
      </div>
      <div className="mt-3"><StatusBadge state={printer.state || 'offline'} /></div>
      <dl className="monitor-values">
        <div>
          <dt>Filament</dt>
          <dd>{remaining === undefined || remaining === null ? '—' : `${Math.round(remaining)}g`}</dd>
        </div>
        <div>
          <dt>Time left</dt>
          <dd>{printer.eta || '—'}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span>Filament remaining</span>
          <span className="text-slate-800">{filamentProgress === null ? '—' : `${Math.round(filamentProgress)}%`}</span>
        </div>
        <div className="progress filament-progress">
          <span style={{ width: `${filamentProgress ?? 0}%` }} />
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-500">
          <span>Progress</span><span className="text-slate-800">{progress}%</span>
        </div>
        <div className="progress"><span style={{ width: `${progress}%` }} /></div>
      </div>
    </article>
  )
}
