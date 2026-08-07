const labels = { printing: 'Printing', preparing: 'Preparing', idle: 'Idle', paused: 'Paused', completed: 'Completed', offline: 'Offline', error: 'Error' }

export function StatusBadge({ state }) {
  return <span className={`status ${state}`}><i />{labels[state] || 'Unknown'}</span>
}
