'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import { PENDING_JOIN_KEY } from '@/lib/chat/pending-join.js';

/**
 * /join/<code>: a group invite link. Signed in, it shows the group and joins
 * it. Signed out, it keeps the code and sends you to sign in; /chat joins the
 * group once you are in, whichever way you signed in.
 */
export default function JoinGroupPage() {
  const { code } = useParams();
  const router = useRouter();
  const signedIn = useAuthStore((s) => !!s.user);
  const [group, setGroup] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!signedIn || !code) return;
    fetch(`/api/chat/invites/${encodeURIComponent(code)}`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'This invite link is not valid any more.');
        if (data.already_member) return router.replace(`/chat?conversation=${data.conversation_id}`);
        setGroup(data);
      })
      .catch((e) => setError(e.message));
  }, [signedIn, code]);

  async function join() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/conversations/join', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not join the group');
      router.replace(`/chat?conversation=${data.conversation_id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  function signIn() {
    try { localStorage.setItem(PENDING_JOIN_KEY, String(code)); } catch {}
    router.push('/auth');
  }

  return (
    <main className="container" style={{ maxWidth: 520, padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '.5rem' }}>
        {group ? `Join ${group.name}` : 'You are invited to a group chat'}
      </h1>
      {group && (
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          {group.members} {group.members === 1 ? 'member' : 'members'}
        </p>
      )}
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Messages on qrypt.chat are end-to-end encrypted with ML-KEM-1024. Once you join, you can read what is sent from then on,
        not what was sent before.
      </p>
      {error ? (
        <p style={{ color: 'var(--color-error, #dc2626)' }}>{error}</p>
      ) : signedIn ? (
        <button className="btn btn-primary" onClick={join} disabled={busy || !group} style={{ padding: '.75rem 1.5rem' }}>
          {busy ? 'Joining…' : group ? 'Join group' : 'Loading…'}
        </button>
      ) : (
        <>
          <button className="btn btn-primary" onClick={signIn} style={{ padding: '.75rem 1.5rem' }}>Sign in to join</button>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem', marginTop: '1rem' }}>
            No account yet? Signing up takes a minute, and you join the group right after.
          </p>
        </>
      )}
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem', marginTop: '2rem' }}>
        In a terminal: <code>qc join https://qrypt.chat/join/{code}</code>
      </p>
    </main>
  );
}
