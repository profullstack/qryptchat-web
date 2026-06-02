'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';

export default function CompleteKeyReset() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | confirm | resetting | done

  async function handleReset() {
    if (!confirmed) return;
    setLoading(true); setError('');
    setPhase('resetting');
    try {
      // 1. Delete server-side keys
      const deleteRes = await fetch('/api/keys/delete', { method: 'POST', credentials: 'include' });
      if (!deleteRes.ok) {
        const d = await deleteRes.json();
        throw new Error(d.error || 'Failed to delete server keys');
      }

      // 2. Reset server key record
      const resetRes = await fetch('/api/keys/reset', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: '' }),
      });

      // 3. Clear local IndexedDB keys
      const { indexedDBManager } = await import('@/lib/crypto/indexed-db-manager.js');
      await indexedDBManager.delete('qryptchat_pq_keypair');

      // 4. Clear key backup
      await fetch('/api/auth/key-backup', { method: 'DELETE', credentials: 'include' }).catch(() => {});

      setPhase('done');
      setTimeout(async () => {
        await logout();
        router.push('/auth');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Key reset failed');
      setPhase('idle');
    } finally { setLoading(false); }
  }

  return (
    <div>
      <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid #f87171', borderRadius: '.5rem', padding: '1rem', marginBottom: '1rem' }}>
        <h4 style={{ color: '#dc2626', fontWeight: 700, marginBottom: '.5rem' }}>⚠️ Nuclear Key Reset</h4>
        <p style={{ fontSize: '.875rem', color: '#991b1b', lineHeight: 1.6 }}>
          This will permanently delete all your encryption keys (local and server-side backup).
          All existing encrypted messages will become unreadable. This action cannot be undone.
        </p>
      </div>

      {error && <div style={{ background: 'rgba(239,68,68,.1)', color: '#991b1b', padding: '.625rem .875rem', borderRadius: '.375rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}

      {phase === 'done' && <div style={{ background: 'rgba(16,185,129,.1)', color: '#065f46', padding: '.625rem .875rem', borderRadius: '.375rem', fontSize: '.875rem', marginBottom: '.75rem' }}>Keys reset. Logging you out...</div>}

      {phase !== 'done' && (
        <>
          {phase !== 'confirm' ? (
            <button className="btn btn-error" onClick={() => setPhase('confirm')} style={{ background: 'var(--color-error)', color: 'white', border: 'none' }}>
              Reset All Encryption Keys
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: '.125rem' }} />
                <span style={{ fontSize: '.875rem', color: 'var(--color-text-primary)' }}>
                  I understand this will permanently delete all my encryption keys and all my encrypted messages will become unreadable.
                </span>
              </label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button
                  className="btn"
                  style={{ background: 'var(--color-error)', color: 'white', border: 'none' }}
                  onClick={handleReset}
                  disabled={!confirmed || loading}
                >
                  {loading ? 'Resetting...' : 'Confirm Reset'}
                </button>
                <button className="btn btn-secondary" onClick={() => { setPhase('idle'); setConfirmed(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
