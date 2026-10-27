'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { keySyncService } from '@/lib/crypto/key-sync-service.js';

export default function EncryptionWarning() {
  const router = useRouter();
  const [hasKeys, setHasKeys] = useState(true);
  // This device's keys are not the account's: messages sent to you won't open here.
  const [mismatch, setMismatch] = useState(false);
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function check() {
      try {
        await keyManager.initialize();
        const has = await keyManager.hasUserKeys();
        setHasKeys(has);
        if (has) setMismatch((await keySyncService.publishedKeyStatus()) === 'differs');
      } catch {
        setHasKeys(false);
      }
      setChecked(true);
    }
    check();
    const onMismatch = () => setMismatch(true);
    window.addEventListener('qrypt:key-mismatch', onMismatch);
    return () => window.removeEventListener('qrypt:key-mismatch', onMismatch);
  }, []);

  async function handleUseThisDevice() {
    const ok = window.confirm(
      "Make this device's keys your account's keys?\n\nEveryone will encrypt new messages to this device's key. Your other devices (and qc) will stop reading new messages until they restore these keys, and this device still won't read your past messages. Restoring your keys here is almost always the better choice."
    );
    if (!ok) return;
    setGenerating(true);
    setError('');
    try {
      const result = await keySyncService.forceSyncPublicKey();
      if (!result.success) throw new Error(result.error || 'Could not publish this device\'s key');
      setMismatch(false);
    } catch (err) {
      setError(err?.message || 'Could not publish this device\'s key');
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate() {
    // New keys give you a fresh identity but make every message that was
    // encrypted to your previous key permanently unreadable. Restoring/uploading
    // existing keys is almost always what the user actually wants.
    const ok = window.confirm(
      'Generate brand-new keys?\n\nYou will NOT be able to read any past messages or files that were encrypted to your previous keys. If you have a backup or an exported key file, use "Upload existing keys" instead.'
    );
    if (!ok) return;
    setGenerating(true);
    setError('');
    try {
      await keyManager.generateUserKeys();
      // Chosen on purpose, so publish it: sign-in never replaces a published key by itself.
      const result = await keySyncService.forceSyncPublicKey();
      if (!result.success) throw new Error(result.error || 'Keys made, but publishing them failed');
      setHasKeys(true);
      setMismatch(false);
    } catch (err) {
      setError(err?.message || 'Failed to generate keys');
    } finally {
      setGenerating(false);
    }
  }

  if (!checked || (hasKeys && !mismatch)) return null;

  if (hasKeys && mismatch) {
    return (
      <div className="encryption-warning" role="alert">
        <div className="warning-icon">⚠️</div>
        <div className="warning-content">
          <strong>This device has different keys from your account</strong>
          <p>
            Messages sent to you are encrypted to your account&apos;s key, which this browser doesn&apos;t hold, so they
            won&apos;t open here. Restore your keys (backup PIN or key file) to read everything.
          </p>
          {error && <p className="warning-error">{error}</p>}
          <div className="warning-actions">
            <button type="button" className="warn-btn warn-btn-primary" onClick={() => router.push('/settings')} disabled={generating}>
              Restore my keys
            </button>
            <button type="button" className="warn-btn warn-btn-secondary" onClick={handleUseThisDevice} disabled={generating}>
              {generating ? 'Publishing…' : "Use this device's keys"}
            </button>
          </div>
        </div>
        <style>{warningCss}</style>
      </div>
    );
  }

  return (
    <div className="encryption-warning">
      <div className="warning-icon">⚠️</div>
      <div className="warning-content">
        <strong>No encryption keys on this device</strong>
        <p>
          This browser doesn&apos;t have your encryption keys, so messages can&apos;t be decrypted or sent
          securely. Upload your existing keys to keep your history, or generate new ones to start fresh.
        </p>
        {error && <p className="warning-error">{error}</p>}
        <div className="warning-actions">
          <button
            type="button"
            className="warn-btn warn-btn-primary"
            onClick={() => router.push('/settings')}
            disabled={generating}
          >
            Upload existing keys
          </button>
          <button
            type="button"
            className="warn-btn warn-btn-secondary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate new keys'}
          </button>
        </div>
        <p className="warning-hint">
          Switched browsers or devices? Choose <strong>Upload existing keys</strong> — generating new keys
          loses access to all past messages.
        </p>
      </div>
      <style>{warningCss}</style>
    </div>
  );
}

const warningCss = `
        .encryption-warning { display: flex; align-items: flex-start; gap: 1rem; padding: .75rem 1rem; background: rgba(245,158,11,.1); border-bottom: 1px solid #f59e0b; color: #92400e; }
        .warning-icon { font-size: 1.25rem; flex-shrink: 0; line-height: 1.4; }
        .warning-content p { font-size: .875rem; margin-top: .25rem; }
        .warning-error { color: #991b1b; font-weight: 600; }
        .warning-actions { display: flex; gap: .5rem; margin-top: .625rem; flex-wrap: wrap; }
        .warn-btn { padding: .375rem .75rem; font-size: .875rem; border-radius: .375rem; cursor: pointer; border: 1px solid transparent; font-weight: 600; }
        .warn-btn:disabled { opacity: .6; cursor: default; }
        .warn-btn-primary { background: #92400e; color: #fff; }
        .warn-btn-secondary { background: transparent; color: #92400e; border-color: #92400e; }
        .warning-hint { font-size: .75rem; margin-top: .5rem; opacity: .85; }
      `;
