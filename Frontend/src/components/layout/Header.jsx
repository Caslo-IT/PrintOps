import { Activity, Menu, Search } from 'lucide-react'

export function Header({ onMenuClick }) {
  return <header className="flex h-[82px] items-center justify-between border-b border-slate-200/80 bg-white/80 px-5 backdrop-blur-md sm:px-8">
    <div className="flex items-center gap-3"><button type="button" className="icon-button" onClick={onMenuClick} aria-label="Toggle navigation"><Menu size={20} /></button><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">PrintOps control center</p></div></div>
    <div className="flex items-center gap-2 sm:gap-4"><button className="icon-button hidden sm:flex"><Search size={18} /></button><button className="icon-button relative hidden sm:flex"><Activity size={18} /><span className="notification-dot" /></button></div>
  </header>
}
