'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';
import KeyBackupSetup from '@/lib/components/KeyBackupSetup.jsx';

export default function PrivateKeyManager() {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasKeys, setHasKeys] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [sealVersion, setSealVersion] = useState(null);
  const [backupLoading, setBackupLoading] = useState(true);
  const [showBackupSetup, setShowBackupSetup] = useState(false);
  const [restoreSecret, setRestoreSecret] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importPassword, setImportPassword] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importAndBackup, setImportAndBackup] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [confirmExportPassword, setConfirmExportPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (user) { checkKeys(); checkBackup(); }
  }, [user?.id]);

  async function checkKeys() {
    try { await keyManager.initialize(); setHasKeys(await keyManager.hasUserKeys()); } catch {}
  }

  async function checkBackup() {
    try {
      setBackupLoading(true);
      const info = await privateKeyManager.getServerBackupInfo();
      setHasBackup(info.exists); setSealVersion(info.sealVersion);
    } catch {} finally { setBackupLoading(false); }
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

  async function restoreKeys() {
    if (!restoreSecret) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const { legacy } = await privateKeyManager.restoreKeysFromServer(restoreSecret);
      setHasKeys(true); setRestoreSecret('');
      if (legacy) { setShowBackupSetup(true); setSuccess('Keys restored. Now re-seal your backup with a passphrase.'); }
      else setSuccess('Keys restored!');
    } catch (err) { setError((err.message || 'Restore failed').replace(/^Failed to restore keys from server: /, '')); }
    finally { setLoading(false); }
  }

  async function importFromFile() {
    if (!importFile || !importPassword) return;
    setImportLoading(true); setError(''); setSuccess('');
    try {
      const text = await importFile.text();
      await privateKeyManager.importPrivateKeys(text, importPassword);
      setHasKeys(true);

      setImportFile(null);
      setImportPassword('');
      if (importAndBackup) setShowBackupSetup(true);
      setSuccess(`Keys imported successfully!${importAndBackup ? ' Choose a backup passphrase below to save them to the server.' : ''}`);
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
        <h4>Server Key Backup / Restore</h4>
        {backupLoading ? <span style={{ color: 'var(--color-text-secondary)', fontSize: '.875rem' }}>Checking...</span> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
              {dot(hasBackup && sealVersion >= 2)}
              <span>{!hasBackup ? 'No server backup' : sealVersion >= 2 ? 'Backup sealed with your passphrase' : 'Old PIN backup: re-seal it with a passphrase'}</span>
            </div>
            <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.75rem' }}>
              Backups are sealed on this device. We store only the sealed copy and cannot open it: if you lose both the
              passphrase and the recovery key, the backup is gone and you will need to re-import your keys from a file
              or start with new keys.
            </p>
            {hasKeys && (showBackupSetup || !hasBackup || sealVersion < 2 ? (
              <div style={{ marginBottom: '.75rem' }}>
                <KeyBackupSetup
                  compact
                  legacy={hasBackup && sealVersion < 2}
                  onDone={() => { setShowBackupSetup(false); setHasBackup(true); setSealVersion(2); setSuccess('Keys backed up!'); }}
                  onSkip={hasBackup && sealVersion >= 2 ? () => setShowBackupSetup(false) : undefined}
                />
              </div>
            ) : (
              <button className="btn btn-secondary btn-sm" style={{ marginBottom: '.75rem' }} onClick={() => setShowBackupSetup(true)}>
                Update backup (new passphrase and recovery key)
              </button>
            ))}
            {hasBackup && (
              <div>
                <p style={{ fontSize: '.8125rem', color: 'var(--color-text-secondary)', marginBottom: '.5rem' }}>Restore keys from the server backup:</p>
                <input type="password" autoComplete="current-password" value={restoreSecret} onChange={(e) => setRestoreSecret(e.target.value)} placeholder={sealVersion >= 2 ? 'Passphrase or recovery key' : 'Old backup PIN'} className="pkm-input" style={{ marginBottom: '.5rem' }} />
                <button className="btn btn-primary btn-sm" onClick={restoreKeys} disabled={loading || !restoreSecret}>{loading ? 'Restoring...' : 'Restore Keys'}</button>
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
