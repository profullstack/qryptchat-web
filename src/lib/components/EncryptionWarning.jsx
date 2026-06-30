'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { keyManager } from '@/lib/crypto/key-manager.js';

export default function EncryptionWarning() {
  const router = useRouter();
  const [hasKeys, setHasKeys] = useState(true);
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function check() {
      try {
        await keyManager.initialize();
        setHasKeys(await keyManager.hasUserKeys());
      } catch {
        setHasKeys(false);
      }
      setChecked(true);
    }
    check();
  }, []);

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
      setHasKeys(true);
    } catch (err) {
      setError(err?.message || 'Failed to generate keys');
    } finally {
      setGenerating(false);
    }
  }

  if (!checked || hasKeys) return null;

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
      <style>{`
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
      `}</style>
    </div>
  );
}
