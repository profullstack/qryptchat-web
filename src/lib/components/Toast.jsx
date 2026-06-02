'use client';

import { useEffect } from 'react';
import { useMessagesStore } from '@/lib/stores/messages.js';

export default function Toast({ id, type, message, title, dismissible = true, autoDismiss = 0 }) {
  const remove = useMessagesStore((s) => s.remove);

  useEffect(() => {
    if (autoDismiss > 0) {
      const timer = setTimeout(() => remove(id), autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [id, autoDismiss, remove]);

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-icon">{icons[type] || 'ℹ'}</div>
      <div className="toast-body">
        {title && <div className="toast-title">{title}</div>}
        <div className="toast-message">{message}</div>
      </div>
      {dismissible && (
        <button className="toast-close" onClick={() => remove(id)} aria-label="Dismiss">×</button>
      )}
      <style>{`
        .toast { display: flex; align-items: flex-start; gap: .75rem; padding: .875rem 1rem; border-radius: .5rem; border: 1px solid; margin-bottom: .5rem; animation: slideIn .2s ease-out; }
        .toast-success { background: rgba(16,185,129,.1); border-color: #10b981; color: #065f46; }
        .toast-error { background: rgba(239,68,68,.1); border-color: #ef4444; color: #991b1b; }
        .toast-warning { background: rgba(245,158,11,.1); border-color: #f59e0b; color: #92400e; }
        .toast-info { background: rgba(59,130,246,.1); border-color: #3b82f6; color: #1e40af; }
        .toast-icon { flex-shrink: 0; font-weight: 700; width: 20px; text-align: center; }
        .toast-body { flex: 1; }
        .toast-title { font-weight: 600; font-size: .875rem; margin-bottom: .25rem; }
        .toast-message { font-size: .875rem; }
        .toast-close { background: none; border: none; cursor: pointer; font-size: 1.25rem; line-height: 1; opacity: .7; padding: 0; }
        .toast-close:hover { opacity: 1; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
