import { Bell, Menu, Search, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { api } from '../../services/api'

export function Header({ onMenuClick, onNotificationClick, query, onQueryChange, onSearchSubmit }) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (showNotifications) {
      api.getActivityLogs(5).then(logs => {
        setNotifications(Array.isArray(logs) ? logs : [])
      }).catch(console.error)
    }
  }, [showNotifications])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isSearchOpen])

  const formatTime = (isoString) => {
    if (!isoString) return ''
    const date = new Date(isoString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (onSearchSubmit) {
      onSearchSubmit()
    }
  }

  return <header className="relative flex h-[82px] items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 backdrop-blur-md sm:px-8 z-40">
    <div className="flex items-center gap-3">
      <button type="button" className="icon-button" onClick={onMenuClick} aria-label="Toggle navigation">
        <Menu size={20} />
      </button>
      <div className={`${isSearchOpen ? 'hidden sm:block' : 'block'}`}>
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">PrintOps control center</p>
      </div>
    </div>
    <div className="flex items-center gap-2 sm:gap-4 relative">
      
      {/* Search implementation */}
      <div className="flex items-center justify-end overflow-hidden transition-all duration-300">
        {isSearchOpen ? (
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              value={query || ''}
              onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
              placeholder="Search printers..."
              className="h-10 w-[150px] sm:w-[200px] rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm focus:border-slate-300 focus:outline-none focus:ring-0 transition-all"
            />
            <button 
              type="button" 
              className="text-slate-400 hover:text-slate-600 p-1"
              onClick={() => setIsSearchOpen(false)}
            >
              <X size={18} />
            </button>
          </form>
        ) : (
          <button 
            className="icon-button hidden sm:flex" 
            onClick={() => setIsSearchOpen(true)}
          >
            <Search size={18} />
          </button>
        )}
      </div>
      
      {/* Notification Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button 
          className="icon-button relative hidden sm:flex" 
          onClick={() => setShowNotifications(!showNotifications)}
        >
          <Bell size={18} />
          <span className="notification-dot" />
        </button>

        {showNotifications && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="mb-2 flex items-center justify-between px-2 pt-2">
              <h3 className="text-sm font-bold text-slate-800">Notifications</h3>
              <button 
                onClick={() => {
                  setShowNotifications(false)
                  if (onNotificationClick) onNotificationClick()
                }} 
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                View all
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No recent activity</div>
              ) : (
                notifications.map(log => (
                  <div key={log.id} className="flex flex-col rounded-lg p-2 hover:bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase ${
                        log.event_type === 'error' ? 'text-red-500' :
                        log.event_type === 'success' ? 'text-emerald-500' :
                        log.event_type === 'warning' ? 'text-orange-500' : 'text-blue-500'
                      }`}>
                        {log.event_type}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTime(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">{log.message}</p>
                    {(log.printer_name || log.printer_ip) && <p className="mt-0.5 text-[10px] text-slate-400">Printer: {log.printer_name || log.printer_ip}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  </header>
}
