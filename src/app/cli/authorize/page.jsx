'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/auth.js';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';
import { matchCode } from '@/lib/auth/cli-match.js';

/**
 * Approve a `qc login`. The terminal opened this page with a PKCE challenge,
 * where to send the code, and a one-time ML-KEM-1024 public key. Approving
 * seals this browser's keypair to that key (the server only relays it) and
 * hands the terminal a five-minute, single-use code.
 */
function Authorize() {
  const params = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const [match, setMatch] = useState('');
  const [status, setStatus] = useState('idle'); // idle | working | done | denied | error
  const [error, setError] = useState('');
  const [oobCode, setOobCode] = useState('');

  const challenge = params.get('code_challenge') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const state = params.get('state') || '';
  const kem = params.get('kem') || '';
  const client = (params.get('client_name') || 'qc').slice(0, 80);
  const valid =
    /^[A-Za-z0-9_-]{43}$/.test(challenge) &&
    params.get('code_challenge_method') === 'S256' &&
    /^[A-Za-z0-9+/=]{2000,2200}$/.test(kem) &&
    (redirectUri === 'oob' || /^http:\/\/(127\.0\.0\.1|\[::1\]):\d+\//.test(redirectUri));

  useEffect(() => {
    if (valid) matchCode(challenge, kem).then(setMatch);
  }, [valid, challenge, kem]);

  async function approve() {
    setStatus('working');
    setError('');
    try {
      await postQuantumEncryption.initialize();
      const keys = await postQuantumEncryption.exportUserKeys();
      const keyBlob = await postQuantumEncryption.encryptForRecipient(JSON.stringify({ v: 1, ...keys }), kem);
      const session = JSON.parse(localStorage.getItem('qrypt_session') || '{}');
      const res = await fetch('/api/cli/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          code_challenge: challenge,
          code_challenge_method: 'S256',
          redirect_uri: redirectUri,
          client_name: client,
          key_blob: keyBlob,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.code) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
      setStatus('done');
      if (redirectUri === 'oob') {
        setOobCode(body.code);
      } else {
        const to = new URL(redirectUri);
        to.searchParams.set('code', body.code);
        if (state) to.searchParams.set('state', state);
        window.location.assign(to.toString());
      }
    } catch (err) {
      setStatus('error');
      setError(err?.message || 'Something went wrong');
    }
  }

  function deny() {
    setStatus('denied');
    if (redirectUri !== 'oob') {
      const to = new URL(redirectUri);
      to.searchParams.set('error', 'access_denied');
      if (state) to.searchParams.set('state', state);
      window.location.assign(to.toString());
    }
  }

  let content;
  if (!valid) {
    content = (
      <>
        <h1>That link is not a qc login</h1>
        <p>Run <code>qc login</code> in your terminal and open the link it prints.</p>
      </>
    );
  } else if (loading) {
    content = <p>Loading…</p>;
  } else if (!user) {
    content = (
      <>
        <h1>Sign in first</h1>
        <p>Sign in to qrypt.chat in this browser, then open the link from your terminal again.</p>
        <Link className="cli-btn primary" href="/auth">Sign in</Link>
      </>
    );
  } else if (status === 'done' && oobCode) {
    content = (
      <>
        <h1>Paste this into your terminal</h1>
        <pre className="cli-code">{oobCode}</pre>
        <p className="cli-muted">It works once, for five minutes.</p>
      </>
    );
  } else if (status === 'done') {
    content = (
      <>
        <h1>Signed in</h1>
        <p>You can close this tab and go back to your terminal.</p>
      </>
    );
  } else if (status === 'denied') {
    content = (
      <>
        <h1>Not approved</h1>
        <p>Nothing was shared. You can close this tab.</p>
      </>
    );
  } else {
    content = (
      <>
        <h1>Sign in to {client}?</h1>
        <p>
          A terminal wants to use qrypt.chat as <strong>@{user.username}</strong>. It will be able to read and send your
          messages, so approving copies your encryption keys to it, sealed so only that terminal can open them.
        </p>
        <p>Check that your terminal shows this code:</p>
        <pre className="cli-code">{match || '…'}</pre>
        {error && <p className="cli-error">{error}</p>}
        <div className="cli-actions">
          <button className="cli-btn primary" onClick={approve} disabled={status === 'working' || !match}>
            {status === 'working' ? 'Approving…' : 'Approve'}
          </button>
          <button className="cli-btn" onClick={deny} disabled={status === 'working'}>Deny</button>
        </div>
        <p className="cli-muted">Did not run qc login yourself? Deny.</p>
      </>
    );
  }

  return (
    <div className="cli-authorize">
      <div className="cli-card">{content}</div>
      <style>{`
        .cli-authorize { min-height: 70vh; display: flex; align-items: center; justify-content: center; padding: 2rem 1rem; }
        .cli-card { width: 100%; max-width: 30rem; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); border-radius: 1rem; padding: 1.75rem; color: var(--color-text-primary); }
        .cli-card h1 { font-size: 1.375rem; margin: 0 0 .75rem; }
        .cli-card p { line-height: 1.55; margin: .5rem 0; }
        .cli-code { font-size: 1.5rem; letter-spacing: .15em; text-align: center; padding: .75rem; margin: .75rem 0; background: var(--color-bg-tertiary); border-radius: .5rem; overflow-x: auto; word-break: break-all; white-space: pre-wrap; }
        .cli-actions { display: flex; gap: .75rem; margin-top: 1rem; }
        .cli-btn { padding: .6rem 1.25rem; border-radius: .5rem; border: 1px solid var(--color-border-primary); background: transparent; color: var(--color-text-primary); cursor: pointer; font: inherit; text-decoration: none; display: inline-block; }
        .cli-btn.primary { background: var(--color-brand-primary); border-color: var(--color-brand-primary); color: white; }
        .cli-btn:disabled { opacity: .6; cursor: not-allowed; }
        .cli-muted { color: var(--color-text-muted); font-size: .875rem; }
        .cli-error { color: var(--color-error); }
      `}</style>
    </div>
  );
}

export default function CliAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <Authorize />
    </Suspense>
  );
}
