'use client';

import { useEffect, useState } from 'react';

function token() {
  try {
    return JSON.parse(localStorage.getItem('qrypt_session') || '{}').access_token || null;
  } catch {
    return null;
  }
}

async function api(path, method = 'GET') {
  const t = token();
  const res = await fetch(path, { method, headers: t ? { Authorization: `Bearer ${t}` } : {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Why a connect came back to /settings (?coinpay=<code>). */
const RESULTS = {
  connected: 'CoinPay is connected.',
  coinpay_linked_elsewhere: 'That CoinPay account is already connected to another qrypt.chat account.',
  coinpay_already_connected: 'This account is already connected to a different CoinPay account. Disconnect it first.',
  coinpay_not_signed_in: 'Sign in first, then connect CoinPay.',
  coinpay_denied: 'CoinPay connection was cancelled.',
  coinpay_state_mismatch: 'That CoinPay connection expired or was opened in another tab. Please try again.',
};

/**
 * Connect / Disconnect CoinPay (the house master account) as a way to sign in
 * to this account. Connecting needs this session; disconnecting is refused
 * when CoinPay is the only way in.
 */
export default function CoinpaySettings() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      setStatus(await api('/api/auth/coinpay/status'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('coinpay');
    if (code === 'connected') setNotice(RESULTS.connected);
    else if (code) setError(RESULTS[code] || 'CoinPay connection failed. Please try again.');
    load();
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const { url } = await api('/api/auth/coinpay/connect', 'POST');
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect CoinPay? You will no longer be able to sign in with it.')) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/auth/coinpay/disconnect', 'POST');
      setNotice('CoinPay is disconnected.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-settings">
      <p className="cp-help">Sign in to qrypt.chat with the CoinPay account you use across Profullstack sites.</p>
      {error && <p className="cp-error">{error}</p>}
      {notice && <p className="cp-notice">{notice}</p>}
      {!status ? null : status.connected ? (
        <div className="cp-row">
          <span>Connected{status.email ? ` (${status.email})` : ''}</span>
          {status.canDisconnect ? (
            <button type="button" className="cp-secondary" onClick={disconnect} disabled={busy}>Disconnect</button>
          ) : (
            <span className="cp-help">CoinPay is the only way into this account. Add a passkey before disconnecting it.</span>
          )}
        </div>
      ) : !status.configured ? (
        <p className="cp-help">Connecting CoinPay is not available right now.</p>
      ) : (
        <button type="button" className="cp-primary" onClick={connect} disabled={busy}>Connect CoinPay</button>
      )}
      <style>{`
        .cp-settings { display: flex; flex-direction: column; gap: .75rem; }
        .cp-help { color: var(--color-text-secondary); font-size: .875rem; margin: 0; }
        .cp-error { color: var(--color-error); font-size: .875rem; margin: 0; }
        .cp-notice { color: var(--color-success, #16a34a); font-size: .875rem; margin: 0; }
        .cp-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; color: var(--color-text-primary); }
        .cp-primary { align-self: flex-start; padding: .5rem 1rem; border: none; border-radius: .375rem; background: var(--color-brand-primary); color: white; cursor: pointer; }
        .cp-secondary { background: none; border: 1px solid var(--color-border-primary); color: var(--color-text-secondary); border-radius: .375rem; padding: .3rem .6rem; cursor: pointer; }
        .cp-primary:disabled, .cp-secondary:disabled { opacity: .6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
