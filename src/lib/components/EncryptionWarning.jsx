'use client';

import { useState, useEffect } from 'react';
import { keyManager } from '@/lib/crypto/key-manager.js';

export default function EncryptionWarning() {
  const [hasKeys, setHasKeys] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const has = await keyManager.hasUserKeys();
        setHasKeys(has);
      } catch {
        setHasKeys(false);
      }
      setChecked(true);
    }
    check();
  }, []);

  if (!checked || hasKeys) return null;

  return (
    <div className="encryption-warning">
      <div className="warning-icon">⚠️</div>
      <div className="warning-content">
        <strong>Encryption keys not found</strong>
        <p>Your messages cannot be encrypted. Please go to <a href="/settings">Settings</a> to generate or restore your encryption keys.</p>
      </div>
      <style>{`
        .encryption-warning { display: flex; align-items: center; gap: 1rem; padding: .75rem 1rem; background: rgba(245,158,11,.1); border-bottom: 1px solid #f59e0b; color: #92400e; }
        .warning-icon { font-size: 1.25rem; flex-shrink: 0; }
        .warning-content p { font-size: .875rem; margin-top: .25rem; }
        .warning-content a { color: #92400e; font-weight: 600; }
      `}</style>
    </div>
  );
}
