'use client';

import { useEffect } from 'react';

export default function Message({ type = 'info', message, title, dismissible = true, autoDismiss = 0, onDismiss }) {
  useEffect(() => {
    if (autoDismiss > 0 && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismiss);
      return () => clearTimeout(timer);
    }
  }, [autoDismiss, onDismiss]);

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const bg = { success: 'rgba(16,185,129,.1)', error: 'rgba(239,68,68,.1)', warning: 'rgba(245,158,11,.1)', info: 'rgba(59,130,246,.1)' };
  const border = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  const color = { success: '#065f46', error: '#991b1b', warning: '#92400e', info: '#1e40af' };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.75rem', padding: '.875rem 1rem', borderRadius: '.5rem', border: `1px solid ${border[type]}`, background: bg[type], color: color[type], marginBottom: '.5rem' }}>
      <div style={{ flexShrink: 0, fontWeight: 700, width: 20, textAlign: 'center' }}>{icons[type]}</div>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 600, fontSize: '.875rem', marginBottom: '.25rem' }}>{title}</div>}
        <div style={{ fontSize: '.875rem' }}>{message}</div>
      </div>
      {dismissible && onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', lineHeight: 1, opacity: .7, padding: 0 }}>×</button>
      )}
    </div>
  );
}
