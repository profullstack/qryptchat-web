'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';
import { publicKeyService } from '@/lib/crypto/public-key-service.js';

export default function EncryptionSettings() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [keyStatus, setKeyStatus] = useState('checking');
  const [hasKeys, setHasKeys] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [keyInDB, setKeyInDB] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user) checkStatus();
  }, [user?.id]);

  async function checkStatus() {
    try {
      setKeyStatus('checking');
      await postQuantumEncryption.initialize();
      await publicKeyService.initialize();
      const keys = await postQuantumEncryption.getUserKeys();
      const has = !!(keys?.publicKey && keys?.privateKey);
      setHasKeys(has);
      setKeyStatus(has ? 'enabled' : 'disabled');
      if (has && keys.publicKey) {
        setPublicKey(keys.publicKey);
        if (user?.id) {
          const dbKey = await publicKeyService.getUserPublicKey(user.id);
          setKeyInDB(!!dbKey);
        }
      }
    } catch {
      setKeyStatus('error');
      setError('Failed to check encryption status');
    }
  }

  async function generateKeys() {
    setLoading(true); setError(''); setSuccess('');
    try {
      await postQuantumEncryption.initialize();
      await publicKeyService.initialize();
      await postQuantumEncryption.getUserKeys();
      await publicKeyService.initializeUserEncryption();
      const keys = await postQuantumEncryption.getUserKeys();
      if (keys?.publicKey) setPublicKey(keys.publicKey);
      setHasKeys(true); setKeyStatus('enabled'); setKeyInDB(true);
      setSuccess('Post-quantum encryption keys generated! Your messages are now quantum-resistant.');
    } catch (err) {
      setError(err.message || 'Failed to generate encryption keys');
    } finally { setLoading(false); }
  }

  async function syncPublicKey() {
    setSyncing(true); setError(''); setSuccess('');
    try {
      await publicKeyService.initializeUserEncryption();
      setKeyInDB(true);
      setSuccess('Public key synced to server successfully!');
    } catch (err) {
      setError(err.message || 'Failed to sync public key');
    } finally { setSyncing(false); }
  }

  async function copyPublicKey() {
    try { await navigator.clipboard.writeText(publicKey); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  const statusColors = { checking: '#94a3b8', enabled: '#10b981', disabled: '#f59e0b', error: '#ef4444' };
  const statusLabels = { checking: 'Checking...', enabled: 'Enabled ✓', disabled: 'Not configured', error: 'Error' };

  return (
    <div>
      <div className="enc-status-row">
        <div className="enc-dot" style={{ background: statusColors[keyStatus] }} />
        <span>Post-quantum encryption: <strong>{statusLabels[keyStatus]}</strong></span>
      </div>

      {error && <div className="enc-alert enc-error">{error}</div>}
      {success && <div className="enc-alert enc-success">{success}</div>}

      {!hasKeys && keyStatus !== 'checking' && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '.75rem', fontSize: '.875rem' }}>
            Generate ML-KEM-1024 (CRYSTALS-Kyber) keys for quantum-resistant end-to-end encryption.
          </p>
          <button className="btn btn-primary" onClick={generateKeys} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Encryption Keys'}
          </button>
        </div>
      )}

      {hasKeys && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {!keyInDB && (
            <div>
              <div className="enc-alert enc-warning">Public key not synced — others cannot encrypt messages for you.</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: '.5rem' }} onClick={syncPublicKey} disabled={syncing}>
                {syncing ? 'Syncing...' : 'Sync Public Key to Server'}
              </button>
            </div>
          )}
          {publicKey && (
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '.5rem', fontSize: '.875rem' }}>Your Public Key (ML-KEM-1024)</label>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                <textarea readOnly value={publicKey.substring(0, 100) + '...'} style={{ flex: 1, padding: '.5rem', borderRadius: '.375rem', border: '1px solid var(--color-border-primary)', background: 'var(--color-bg-tertiary)', fontSize: '.75rem', fontFamily: 'monospace', resize: 'none', height: '60px', color: 'var(--color-text-secondary)' }} />
                <button className="btn btn-secondary btn-sm" onClick={copyPublicKey}>{copied ? '✓ Copied' : 'Copy'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .enc-status-row { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
        .enc-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .enc-alert { padding: .625rem .875rem; border-radius: .375rem; font-size: .875rem; }
        .enc-error { background: rgba(239,68,68,.1); color: #991b1b; border: 1px solid #fca5a5; }
        .enc-success { background: rgba(16,185,129,.1); color: #065f46; border: 1px solid #6ee7b7; }
        .enc-warning { background: rgba(245,158,11,.1); color: #92400e; border: 1px solid #fcd34d; }
        .btn-sm { padding: .375rem .75rem; font-size: .875rem; }
      `}</style>
    </div>
  );
}
