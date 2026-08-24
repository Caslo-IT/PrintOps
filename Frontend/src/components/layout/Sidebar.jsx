import React from 'react'
import { Activity, Boxes, CircleHelp, HardDrive, LayoutDashboard, Printer, Settings, LogOut, History, Disc, Monitor } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export function Sidebar({ printerCount, queueCount, storageCount, activeView, onNavigate, mobileOpen, desktopOpen, onClose }) {
  const { logout } = useAuth()
  return (
    <>
      {mobileOpen && (
        <button type="button" className="mobile-nav-backdrop lg:hidden" onClick={onClose} aria-label="Close navigation" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[248px] border-r border-slate-200/80 bg-white lg:z-20 lg:flex-col ${
          mobileOpen ? 'flex' : 'hidden'
        } ${desktopOpen ? 'lg:flex' : 'lg:hidden'}`}
      >
        <div className="flex h-[82px] items-center gap-3 border-b border-slate-100 px-7">
          <div className="brand-mark">
            <Printer size={19} strokeWidth={2.5} />
          </div>
          <span className="text-[19px] font-bold tracking-[-0.04em]">
            print<span className="text-orange-500">ops</span>
          </span>
        </div>
        <nav className="flex-1 px-4 py-7">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Workspace</div>
          <NavItem
            icon={<Monitor size={17} />}
            label="Monitor"
            active={activeView === 'monitor'}
            onClick={() => onNavigate('monitor')}
          />
          <NavItem
            icon={<LayoutDashboard size={17} />}
            label="Overview"
            active={activeView === 'overview'}
            onClick={() => onNavigate('overview')}
          />
          <NavItem
            icon={<Printer size={17} />}
            label="Printers"
            count={printerCount}
            active={activeView === 'printers'}
            onClick={() => onNavigate('printers')}
          />
          <NavItem
            icon={<Boxes size={17} />}
            label="Jobs & queue"
            count={queueCount}
            active={activeView === 'queue'}
            onClick={() => onNavigate('queue')}
          />
          <NavItem
            icon={<HardDrive size={17} />}
            label="G-Code Storage"
            count={storageCount}
            active={activeView === 'storage'}
            onClick={() => onNavigate('storage')}
          />
          <NavItem
            icon={<Activity size={17} />}
            label="Activity log"
            active={activeView === 'activity'}
            onClick={() => onNavigate('activity')}
          />
          <NavItem
            icon={<History size={17} />}
            label="Print History"
            active={activeView === 'history'}
            onClick={() => onNavigate('history')}
          />
          <NavItem
            icon={<Disc size={17} />}
            label="Filaments"
            active={activeView === 'filaments'}
            onClick={() => onNavigate('filaments')}
          />
          <div className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">Manage</div>
          <NavItem
            icon={<Settings size={17} />}
            label="Settings"
            active={activeView === 'settings'}
            onClick={() => onNavigate('settings')}
          />
          <NavItem
            icon={<CircleHelp size={17} />}
            label="Help center"
            active={activeView === 'help'}
            onClick={() => onNavigate('help')}
          />
          <NavItem
            icon={<LogOut size={17} />}
            label="Sign Out"
            onClick={logout}
          />
        </nav>
        <div className="m-4 rounded-2xl bg-slate-950 p-4 text-white">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-400">NETWORK STATUS</span>
            <span className="live-dot" />
          </div>
          <p className="text-sm font-semibold">Local network connected</p>
          <p className="mt-1 text-xs text-slate-400">192.168.1.0 / 24</p>
        </div>
      </aside>
    </>
  )
}

function NavItem({ icon, label, active, count, onClick }) {
  return (
    <button onClick={onClick} className={`nav-item ${active ? 'active' : ''}`}>
      {icon}
      <span>{label}</span>
      {count !== undefined && count !== null && (
        <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{count}</span>
      )}
    </button>
  )
}
