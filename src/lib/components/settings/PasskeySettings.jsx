'use client';

import { useEffect, useState } from 'react';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';

function token() {
  try {
    return JSON.parse(localStorage.getItem('qrypt_session') || '{}').access_token || null;
  } catch {
    return null;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const t = token();
  const res = await fetch(path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'never');

/** Passkeys on this account: add one (any account can), list them, remove one. */
export default function PasskeySettings() {
  const [passkeys, setPasskeys] = useState([]);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      setPasskeys((await api('/api/auth/passkey/credentials')).passkeys);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    load();
  }, []);

  async function add() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { challengeId, options } = await api('/api/auth/passkey/register-options', { method: 'POST', body: {} });
      const response = await startRegistration({ optionsJSON: options });
      await api('/api/auth/passkey/register-verify', { method: 'POST', body: { challengeId, response, name: name.trim() || undefined } });
      setName('');
      setNotice('Passkey added. You can sign in with it from the sign-in page.');
      await load();
    } catch (err) {
      setError(err?.name === 'NotAllowedError' ? 'Passkey was cancelled.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this passkey? You will not be able to sign in with it any more.')) return;
    setError('');
    try {
      await api(`/api/auth/passkey/credentials?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="passkey-settings">
      <p className="pk-help">Sign in with Face ID, a fingerprint, Windows Hello or a security key instead of an SMS code.</p>
      {!supported && <p className="pk-error">This browser does not support passkeys.</p>}
      {error && <p className="pk-error">{error}</p>}
      {notice && <p className="pk-notice">{notice}</p>}
      <ul className="pk-list">
        {passkeys.length === 0 && <li className="pk-empty">No passkeys yet.</li>}
        {passkeys.map((p) => (
          <li key={p.id}>
            <div>
              <strong>{p.name || 'Passkey'}</strong>
              <span className="pk-meta">
                {p.backed_up ? 'synced' : 'this device only'} · added {when(p.created_at)} · last used {when(p.last_used_at)}
              </span>
            </div>
            <button type="button" className="pk-remove" onClick={() => remove(p.id)}>Remove</button>
          </li>
        ))}
      </ul>
      {supported && (
        <div className="pk-add">
          <input type="text" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Name it, e.g. MacBook" aria-label="Passkey name" />
          <button type="button" onClick={add} disabled={busy}>{busy ? 'Waiting…' : 'Add a passkey'}</button>
        </div>
      )}
      <style>{`
        .passkey-settings { display: flex; flex-direction: column; gap: .75rem; }
        .pk-help { color: var(--color-text-secondary); font-size: .875rem; margin: 0; }
        .pk-error { color: var(--color-error); font-size: .875rem; margin: 0; }
        .pk-notice { color: var(--color-success, #16a34a); font-size: .875rem; margin: 0; }
        .pk-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .5rem; }
        .pk-list li { display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .6rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; }
        .pk-list li div { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
        .pk-meta { color: var(--color-text-muted); font-size: .75rem; }
        .pk-empty { color: var(--color-text-muted); font-size: .875rem; }
        .pk-remove { background: none; border: 1px solid var(--color-border-primary); color: var(--color-text-secondary); border-radius: .375rem; padding: .3rem .6rem; cursor: pointer; }
        .pk-remove:hover { color: var(--color-error); border-color: var(--color-error); }
        .pk-add { display: flex; gap: .5rem; flex-wrap: wrap; }
        .pk-add input { flex: 1; min-width: 10rem; padding: .5rem .65rem; border: 1px solid var(--color-border-primary); border-radius: .375rem; background: var(--color-bg-primary); color: var(--color-text-primary); }
        .pk-add button { padding: .5rem 1rem; border: none; border-radius: .375rem; background: var(--color-brand-primary); color: white; cursor: pointer; }
        .pk-add button:disabled { opacity: .6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
