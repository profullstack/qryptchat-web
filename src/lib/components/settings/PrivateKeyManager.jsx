'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';

export default function PrivateKeyManager() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasKeys, setHasKeys] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [pinLoading, setPinLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(true);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [backupPin, setBackupPin] = useState('');
  const [restorePin, setRestorePin] = useState('');
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    if (user) { checkKeys(); checkPin(); checkBackup(); }
  }, [user?.id]);

  async function checkKeys() {
    try { await keyManager.initialize(); setHasKeys(await keyManager.hasUserKeys()); } catch {}
  }

  async function checkPin() {
    try {
      setPinLoading(true);
      const res = await fetch('/api/auth/backup-pin', { credentials: 'include' });
      if (res.ok) { const d = await res.json(); setHasPin(d.hasPin); }
    } catch {} finally { setPinLoading(false); }
  }

  async function checkBackup() {
    try { setBackupLoading(true); setHasBackup(await privateKeyManager.hasServerBackup()); }
    catch {} finally { setBackupLoading(false); }
  }

  async function generateKeys() {
    setLoading(true); setError(''); setSuccess('');
    try {
      await keyManager.generateUserKeys();
      setHasKeys(true);
      setSuccess('Encryption keys generated!');
    } catch (err) { setError(err.message || 'Failed to generate keys'); }
    finally { setLoading(false); }
  }

  async function backupKeys() {
    if (!backupPin) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const encrypted = await privateKeyManager.exportPrivateKeys(backupPin);
      const res = await fetch('/api/auth/key-backup', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted_keys: encrypted }),
      });
      if (res.ok) { setHasBackup(true); setBackupPin(''); setSuccess('Keys backed up!'); }
      else { const d = await res.json(); setError(d.error || 'Backup failed'); }
    } catch (err) { setError(err.message || 'Backup failed'); }
    finally { setLoading(false); }
  }

  async function restoreKeys() {
    if (!restorePin) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      await privateKeyManager.restoreKeysFromServer(restorePin);
      setHasKeys(true); setRestorePin(''); setSuccess('Keys restored!');
    } catch (err) { setError(err.message || 'Wrong PIN or restore failed'); }
    finally { setLoading(false); }
  }

  async function setNewPin() {
    if (!pin || pin !== confirmPin || !/^\d{6,12}$/.test(pin)) { setError('PIN must be 6–12 digits and match'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/auth/backup-pin', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) { setHasPin(true); setPin(''); setConfirmPin(''); setChangingPin(false); setSuccess('Backup PIN set!'); }
      else { const d = await res.json(); setError(d.error || 'Failed to set PIN'); }
    } catch (err) { setError(err.message || 'Failed'); }
    finally { setLoading(false); }
  }

  const dot = (on) => (
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#10b981' : '#94a3b8', flexShrink: 0 }} />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {error && <div className="pkm-alert pkm-error">{error}</div>}
      {success && <div className="pkm-alert pkm-success">{success}</div>}

      <div className="pkm-card">
        <h4>Local Encryption Keys</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
          {dot(hasKeys)}<span>{hasKeys ? 'Keys present on this device' : 'No keys found'}</span>
        </div>
        {!hasKeys && <button className="btn btn-primary btn-sm" onClick={generateKeys} disabled={loading}>{loading ? 'Generating...' : 'Generate Keys'}</button>}
      </div>

      <div className="pkm-card">
        <h4>Backup PIN</h4>
        {pinLoading ? <span style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem' }}>Checking...</span> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
              {dot(hasPin)}<span>{hasPin ? 'Backup PIN is set' : 'No backup PIN configured'}</span>
            </div>
            {(!hasPin || changingPin) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                <input type={showPin ? 'text' : 'password'} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="6–12 digit PIN" className="pkm-input" />
                <input type={showPin ? 'text' : 'password'} inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Confirm PIN" className="pkm-input" />
                <label className="pkm-label"><input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} /> Show PIN</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={setNewPin} disabled={loading}>Save PIN</button>
                  {changingPin && <button className="btn btn-secondary btn-sm" onClick={() => { setChangingPin(false); setPin(''); setConfirmPin(''); }}>Cancel</button>}
                </div>
              </div>
            )}
            {hasPin && !changingPin && <button className="btn btn-secondary btn-sm" onClick={() => setChangingPin(true)}>Change PIN</button>}
          </>
        )}
      </div>

      <div className="pkm-card">
        <h4>Server Key Backup / Restore</h4>
        {backupLoading ? <span style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem' }}>Checking...</span> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
              {dot(hasBackup)}<span>{hasBackup ? 'Encrypted backup exists on server' : 'No server backup'}</span>
            </div>
            {hasKeys && (
              <div style={{ marginBottom: '.75rem' }}>
                <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.5rem' }}>Backup your keys (encrypted with PIN):</p>
                <input type="password" inputMode="numeric" value={backupPin} onChange={(e) => setBackupPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter PIN to encrypt backup" className="pkm-input" style={{ marginBottom: '.5rem' }} />
                <button className="btn btn-primary btn-sm" onClick={backupKeys} disabled={loading || !backupPin}>{loading ? 'Backing up...' : hasBackup ? 'Update Backup' : 'Backup Keys'}</button>
              </div>
            )}
            {hasBackup && (
              <div>
                <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.5rem' }}>Restore keys from server backup:</p>
                <input type="password" inputMode="numeric" value={restorePin} onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Backup PIN" className="pkm-input" style={{ marginBottom: '.5rem' }} />
                <button className="btn btn-primary btn-sm" onClick={restoreKeys} disabled={loading || !restorePin}>{loading ? 'Restoring...' : 'Restore Keys'}</button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        .pkm-card { padding: 1rem; background: var(--color-bg-secondary); border-radius: .5rem; border: 1px solid var(--color-border-primary); }
        .pkm-card h4 { font-size: .9375rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: .75rem; }
        .pkm-alert { padding: .625rem .875rem; border-radius: .375rem; font-size: .875rem; }
        .pkm-error { background: rgba(239,68,68,.1); color: #991b1b; border: 1px solid #fca5a5; }
        .pkm-success { background: rgba(16,185,129,.1); color: #065f46; border: 1px solid #6ee7b7; }
        .pkm-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .375rem; background: var(--color-bg-primary); color: var(--color-text-primary); font-size: .875rem; }
        .pkm-label { font-size: .8125rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: .375rem; }
        .btn-sm { padding: .375rem .75rem; font-size: .875rem; }
      `}</style>
    </div>
  );
}
