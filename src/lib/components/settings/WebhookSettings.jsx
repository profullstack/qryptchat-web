'use client';

import { useState, useEffect } from 'react';

const EVENT_OPTIONS = ['message.created', 'conversation.created', 'message.deleted'];

export default function WebhookSettings() {
  const [webhooks, setWebhooks] = useState([]);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('message.created');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadWebhooks(); }, []);

  async function loadWebhooks() {
    try {
      const res = await fetch('/api/webhooks', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setWebhooks(d.webhooks || []); }
    } catch {}
  }

  async function addWebhook(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), events: events.split(',').map((e) => e.trim()) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to add webhook'); }
      else { setWebhooks([data.webhook, ...webhooks]); setUrl(''); }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function removeWebhook(id) {
    const res = await fetch(`/api/webhooks/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setWebhooks(webhooks.filter((w) => w.id !== id));
  }

  return (
    <div>
      {error && <div style={{ background: 'rgba(239,68,68,.1)', color: '#991b1b', border: '1px solid #fca5a5', padding: '.625rem .875rem', borderRadius: '.375rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}

      <form onSubmit={addWebhook} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1.25rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '.375rem', fontSize: '.875rem' }}>Webhook URL</label>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhook" required style={{ width: '100%', padding: '.5rem .75rem', borderRadius: '.375rem', border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '.375rem', fontSize: '.875rem' }}>Events</label>
          <select value={events} onChange={(e) => setEvents(e.target.value)} style={{ width: '100%', padding: '.5rem .75rem', borderRadius: '.375rem', border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>
            {EVENT_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Adding...' : 'Add Webhook'}
        </button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {webhooks.length === 0 && <p style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem' }}>No webhooks configured.</p>}
        {webhooks.map((wh) => (
          <div key={wh.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.75rem', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: '.375rem' }}>
            <div>
              <div style={{ fontSize: '.875rem', fontWeight: 500, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{wh.url}</div>
              <div style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)' }}>{Array.isArray(wh.events) ? wh.events.join(', ') : wh.events}</div>
            </div>
            <button onClick={() => removeWebhook(wh.id)} style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '.25rem .5rem', fontSize: '.875rem' }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
