'use client';

import { useState, useEffect } from 'react';

export default function DisappearingMessageSettings({ conversationId }) {
  const [setting, setSetting] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/disappearing-messages`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setSetting(d.setting)).catch(() => {});
  }, [conversationId]);

  async function updateSetting(value) {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/disappearing-messages`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: value }),
      });
      if (res.ok) setSetting(value);
    } catch {} finally { setLoading(false); }
  }

  const options = [
    { label: 'Off', value: null },
    { label: '24 hours', value: 86400 },
    { label: '7 days', value: 604800 },
    { label: '30 days', value: 2592000 },
  ];

  return (
    <div className="disappearing-settings">
      <h4>Disappearing Messages</h4>
      <div className="options">
        {options.map((opt) => (
          <button key={String(opt.value)} className={`option-btn${setting === opt.value ? ' active' : ''}`} onClick={() => updateSetting(opt.value)} disabled={loading}>
            {opt.label}
          </button>
        ))}
      </div>
      <style>{`
        .disappearing-settings { padding: 1rem; }
        .disappearing-settings h4 { margin-bottom: .75rem; font-weight: 600; }
        .options { display: flex; gap: .5rem; flex-wrap: wrap; }
        .option-btn { padding: .375rem .75rem; border: 1px solid var(--color-border-primary); background: var(--color-bg-secondary); border-radius: .375rem; cursor: pointer; font-size: .875rem; }
        .option-btn.active { background: var(--color-brand-primary); color: white; border-color: var(--color-brand-primary); }
      `}</style>
    </div>
  );
}
