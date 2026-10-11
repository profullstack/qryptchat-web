'use client';

import { useEffect, useState } from 'react';

/**
 * A group admin's invite link: make it, copy it, reset it (the old link stops
 * working) or turn it off. Whoever opens it joins the group and reads what is
 * sent from then on.
 */
export default function GroupInviteModal({ conversationId, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const base = `/api/chat/conversations/${encodeURIComponent(conversationId)}/invite`;

  async function call(method, body) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(base, {
        method, credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      if (method === 'DELETE') setInvite(null);
      else setInvite(data.invite ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  useEffect(() => { call('GET'); }, [conversationId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it.');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Invite link</h3><button onClick={onClose}>×</button></div>
        <p className="gi-hint">Anyone signed in to qrypt.chat who opens this link joins the group. They can read messages sent after they join, not earlier ones.</p>
        {loading ? (
          <p className="gi-hint">Loading…</p>
        ) : invite ? (
          <>
            <div className="gi-row">
              <input className="gi-link" readOnly value={invite.url} onFocus={(e) => e.target.select()} />
              <button className="btn btn-primary" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
            <p className="gi-hint">{invite.uses === 1 ? '1 person has' : `${invite.uses} people have`} joined with this link.</p>
            <div className="gi-row">
              <button className="btn" disabled={busy} onClick={() => call('POST', { reset: true })}>Reset link</button>
              <button className="btn" disabled={busy} onClick={() => call('DELETE')}>Turn off</button>
            </div>
          </>
        ) : (
          <button className="btn btn-primary" disabled={busy} onClick={() => call('POST', {})} style={{ width: '100%' }}>
            {busy ? 'Creating…' : 'Create invite link'}
          </button>
        )}
        {error && <div className="error">{error}</div>}
        <style>{`
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
          .modal-content { background: var(--color-bg-primary); border-radius: 1rem; padding: 1.5rem; width: 100%; max-width: 440px; }
          .modal-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
          .gi-hint { color: var(--color-text-secondary); font-size: .875rem; line-height: 1.5; margin: 0 0 .75rem; }
          .gi-row { display: flex; gap: .5rem; margin-bottom: .75rem; }
          .gi-link { flex: 1; min-width: 0; padding: .5rem .625rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); font-family: monospace; font-size: .8rem; }
          .btn { padding: .5rem .875rem; border: 1px solid var(--color-border-primary); background: var(--color-bg-secondary); color: var(--color-text-primary); border-radius: .5rem; cursor: pointer; font-weight: 500; }
          .btn:disabled { opacity: .6; cursor: not-allowed; }
          .btn-primary { background: var(--color-brand-primary); border-color: var(--color-brand-primary); color: #fff; }
          .error { color: var(--color-error, #dc2626); font-size: .875rem; margin-top: .5rem; }
        `}</style>
      </div>
    </div>
  );
}
