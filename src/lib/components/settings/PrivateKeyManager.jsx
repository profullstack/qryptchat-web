'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';

const PIN_PATTERN = /^\d{4,12}$/;
const digits = (v) => v.replace(/\D/g, '').slice(0, 12);

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
  const [currentPin, setCurrentPin] = useState('');
  const [importBackupPin, setImportBackupPin] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [backupPin, setBackupPin] = useState('');
  const [restorePin, setRestorePin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPassword, setImportPassword] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importAndBackup, setImportAndBackup] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [confirmExportPassword, setConfirmExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (user) { checkKeys(); checkPin(); checkBackup(); }
  }, [user?.id]);

  async function checkKeys() {
    try { await keyManager.initialize(); setHasKeys(await keyManager.hasUserKeys()); } catch {}
  }

  async function checkPin() {
    try {
      setPinLoading(true);
      const res = await fetch('/api/auth/backup-pin', { credentials: 'include', headers: privateKeyManager._authHeaders() });
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
      await privateKeyManager.backupKeysToServer(backupPin);
      setHasBackup(true); setHasPin(true); setBackupPin(''); setSuccess('Keys backed up!');
    } catch (err) { setError((err.message || 'Backup failed').replace(/^Failed to backup keys to server: /, '')); }
    finally { setLoading(false); }
  }

  async function restoreKeys() {
    if (!restorePin) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      await privateKeyManager.restoreKeysFromServer(restorePin);
      setHasKeys(true); setRestorePin(''); setSuccess('Keys restored!');
    } catch (err) { setError((err.message || 'Wrong PIN or restore failed').replace(/^Failed to restore keys from server: /, '')); }
    finally { setLoading(false); }
  }

  async function importFromFile() {
    if (!importFile || !importPassword) return;
    if (importAndBackup && !PIN_PATTERN.test(importBackupPin)) { setError('Enter your 4–12 digit backup PIN to save a server backup'); return; }
    setImportLoading(true); setError(''); setSuccess('');
    try {
      const text = await importFile.text();
      await privateKeyManager.importPrivateKeys(text, importPassword);
      setHasKeys(true);

      if (importAndBackup) {
        await privateKeyManager.backupKeysToServer(importBackupPin);
        setHasBackup(true); setHasPin(true);
      }

      setImportFile(null);
      setImportPassword('');
      setImportBackupPin('');
      setSuccess(`Keys imported${importAndBackup ? ' and backed up to server' : ''} successfully!`);
    } catch (err) {
      setError(err.message || 'Import failed — wrong password or invalid file');
    } finally { setImportLoading(false); }
  }

  async function downloadKeys() {
    if (exportPassword.length < 6) { setError('Export password must be at least 6 characters'); return; }
    if (exportPassword !== confirmExportPassword) { setError('Export passwords do not match'); return; }
    setExportLoading(true); setError(''); setSuccess('');
    try {
      const encrypted = await privateKeyManager.exportPrivateKeys(exportPassword);
      const filename = privateKeyManager.generateExportFilename();
      privateKeyManager.downloadExportedKeys(encrypted, filename);
      setExportPassword(''); setConfirmExportPassword('');
      setSuccess(`Downloaded ${filename} — store it somewhere safe. Without this password the file cannot be recovered.`);
    } catch (err) { setError(err.message || 'Export failed'); }
    finally { setExportLoading(false); }
  }

  async function setNewPin() {
    if (!pin || pin !== confirmPin || !PIN_PATTERN.test(pin)) { setError('PIN must be 4–12 digits and match'); return; }
    if (hasPin && !currentPin) { setError('Enter your current PIN'); return; }
    // The server backup is encrypted with the PIN, so a new PIN means a new
    // backup; without keys on this device the old backup could not be redone.
    if (hasPin && hasBackup && !hasKeys) { setError('Restore your keys on this device before changing the PIN'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/auth/backup-pin', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...privateKeyManager._authHeaders() },
        body: JSON.stringify({ pin, ...(hasPin ? { currentPin } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.code === 'PIN_WRONG' && typeof d.remaining === 'number'
          ? `Current PIN is wrong. ${d.remaining} attempt${d.remaining === 1 ? '' : 's'} left before a lockout.`
          : d.code === 'PIN_LOCKED' ? `Too many wrong PINs. Try again in ${Math.max(1, Math.ceil((d.retryAfter || 60) / 60))} min.`
          : d.error || 'Failed to set PIN');
        return;
      }
      let note = 'Backup PIN set!';
      if (hasBackup && hasKeys) {
        try { await privateKeyManager.backupKeysToServer(pin); note = 'Backup PIN changed and server backup re-encrypted.'; }
        catch { note = 'PIN changed, but re-encrypting the server backup failed. Use "Update Backup" below.'; }
      }
      setHasPin(true); setPin(''); setConfirmPin(''); setCurrentPin(''); setChangingPin(false); setSuccess(note);
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
                {hasPin && <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value))} placeholder="Current PIN" className="pkm-input" />}
                <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} placeholder={hasPin ? 'New 4–12 digit PIN' : '4–12 digit PIN'} className="pkm-input" />
                <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(e) => setConfirmPin(digits(e.target.value))} placeholder="Confirm PIN" className="pkm-input" />
                <p style={{ fontSize: '.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>4 digits works: wrong guesses lock restore for longer each time. 6 or more is stronger.</p>
                <label className="pkm-label"><input type="checkbox" checked={showPin} onChange={(e) => setShowPin(e.target.checked)} /> Show PIN</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={setNewPin} disabled={loading}>Save PIN</button>
                  {changingPin && <button className="btn btn-secondary btn-sm" onClick={() => { setChangingPin(false); setPin(''); setConfirmPin(''); setCurrentPin(''); }}>Cancel</button>}
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
                <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.5rem' }}>Backup your keys (encrypted with your backup PIN):</p>
                <input type="password" inputMode="numeric" value={backupPin} onChange={(e) => setBackupPin(digits(e.target.value))} placeholder={hasPin ? 'Your backup PIN' : 'Choose a 4–12 digit backup PIN'} className="pkm-input" style={{ marginBottom: '.5rem' }} />
                <button className="btn btn-primary btn-sm" onClick={backupKeys} disabled={loading || !PIN_PATTERN.test(backupPin)}>{loading ? 'Backing up...' : hasBackup ? 'Update Backup' : 'Backup Keys'}</button>
              </div>
            )}
            {hasBackup && (
              <div>
                <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.5rem' }}>Restore keys from server backup:</p>
                <input type="password" inputMode="numeric" value={restorePin} onChange={(e) => setRestorePin(digits(e.target.value))} placeholder="Backup PIN" className="pkm-input" style={{ marginBottom: '.5rem' }} />
                <button className="btn btn-primary btn-sm" onClick={restoreKeys} disabled={loading || !PIN_PATTERN.test(restorePin)}>{loading ? 'Restoring...' : 'Restore Keys'}</button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="pkm-card">
        <h4>Download Keys to File</h4>
        {!hasKeys ? (
          <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)' }}>
            No keys on this device yet — generate or restore keys before exporting.
          </p>
        ) : (
          <>
            <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.75rem' }}>
              Save an encrypted copy of your private keys as a JSON file. The file is encrypted with the
              password you choose here — nobody, including us, can recover it if you lose that password.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <input
                type={showExportPassword ? 'text' : 'password'}
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                placeholder="Password to encrypt the file (min 6 characters)"
                className="pkm-input"
              />
              <input
                type={showExportPassword ? 'text' : 'password'}
                value={confirmExportPassword}
                onChange={(e) => setConfirmExportPassword(e.target.value)}
                placeholder="Confirm password"
                className="pkm-input"
              />
              <label className="pkm-label">
                <input type="checkbox" checked={showExportPassword} onChange={(e) => setShowExportPassword(e.target.checked)} /> Show password
              </label>
              <button
                className="btn btn-primary btn-sm"
                onClick={downloadKeys}
                disabled={exportLoading || !exportPassword || !confirmExportPassword}
              >
                {exportLoading ? 'Preparing download...' : 'Download Encrypted Keys'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="pkm-card">
        <h4>Import Keys from File</h4>
        <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.75rem' }}>
          Import an encrypted key backup JSON file (e.g. <code>profullstack-qryptchat-pq-keys-*.json</code>).
          Enter the password you used when the backup was created.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          <input
            type="file"
            accept=".json,application/json"
            className="pkm-input"
            style={{ padding: '.375rem .5rem', cursor: 'pointer' }}
            onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
          />
          <input
            type="password"
            value={importPassword}
            onChange={(e) => setImportPassword(e.target.value)}
            placeholder="Password used to encrypt the backup"
            className="pkm-input"
          />
          <label className="pkm-label">
            <input
              type="checkbox"
              checked={importAndBackup}
              onChange={(e) => setImportAndBackup(e.target.checked)}
            />
            Also save encrypted backup to server
          </label>
          {importAndBackup && (
            <input type="password" inputMode="numeric" value={importBackupPin} onChange={(e) => setImportBackupPin(digits(e.target.value))} placeholder={hasPin ? 'Your backup PIN' : 'Choose a 4–12 digit backup PIN'} className="pkm-input" />
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={importFromFile}
            disabled={importLoading || !importFile || !importPassword}
          >
            {importLoading ? 'Importing...' : 'Import Keys'}
          </button>
        </div>
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
