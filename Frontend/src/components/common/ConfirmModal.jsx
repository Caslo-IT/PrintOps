import React from 'react'
import { AlertTriangle, X } from 'lucide-react'

export function ConfirmModal({ isOpen, title, message, confirmText = 'Confirm', onConfirm, onCancel, isDanger = false }) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="details-modal max-w-sm" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className={`brand-mark ${isDanger ? 'text-red-500' : 'text-orange-500'}`}>
              <AlertTriangle size={18} />
            </div>
            <h2 className="text-base font-bold tracking-[-.03em]">{title || 'Confirm Action'}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Cancel">
            <X size={17} />
          </button>
        </div>
        
        <div className="p-5 text-sm text-slate-600">
          {message}
        </div>
        
        <div className="flex justify-end gap-2 border-t border-slate-100 p-4 bg-slate-50 rounded-b-2xl">
          <button className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button 
            className={`primary-button ${isDanger ? 'bg-red-500 hover:bg-red-600 border-red-600 shadow-red-500/20' : ''}`} 
            onClick={() => {
              onConfirm()
              onCancel()
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
