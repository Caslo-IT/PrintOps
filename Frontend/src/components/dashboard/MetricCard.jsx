export function MetricCard({ label, value, note, icon, tone }) {
  return <div className="panel flex items-start justify-between p-5"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-3 text-[30px] font-bold tracking-[-.06em]">{value}</p><p className="mt-1 text-[11px] text-slate-400">{note}</p></div><div className={`metric-icon ${tone}`}>{icon}</div></div>
}
