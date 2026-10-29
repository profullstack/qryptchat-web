'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';

const CHECKLIST = [
  'Keep an encrypted key export somewhere you control.',
  'Set a backup PIN and verify that restore works on a second device.',
  'Keep the QryptChat web app installed as a PWA for offline access.',
  'For teams, run a self-hosted instance and keep an independent backup channel.',
];

function StatusRow({ label, value, detail }) {
  const good = value === 'Ready' || value === 'Connected' || value === 'Available';
  return (
    <div className="sovereignty-status-row">
      <span className={`sovereignty-dot ${good ? 'is-good' : ''}`} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
      <span className="sovereignty-status-value">{value}</span>
    </div>
  );
}

export default function SovereigntyPanel() {
  const connected = useChatStore((state) => state.connected);
  const [online, setOnline] = useState(true);
  const [serviceWorker, setServiceWorker] = useState(false);
  const [hasKeys, setHasKeys] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    async function inspectDevice() {
      try {
        await keyManager.initialize();
        const keys = await keyManager.hasUserKeys();
        const backup = await privateKeyManager.hasServerBackup();
        if (mounted) {
          setHasKeys(keys);
          setHasBackup(backup);
        }
      } catch {
        // The panel is informational; an unavailable local crypto store should not
        // prevent the rest of Settings from rendering.
      }
      if (mounted) setServiceWorker(Boolean(navigator.serviceWorker?.controller));
    }
    inspectDevice();

    return () => {
      mounted = false;
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const transport = connected ? 'Connected' : online ? 'Standby' : 'Offline';
  const location = useMemo(() => {
    if (typeof window === 'undefined') return 'Browser session';
    return window.location.hostname.endsWith('.onion') ? 'Tor hidden service' : 'Web / self-hosted instance';
  }, []);

  function downloadReport() {
    const report = {
      product: 'QryptChat',
      report: 'sovereignty-readiness',
      generatedAt: new Date().toISOString(),
      instance: typeof window === 'undefined' ? null : window.location.origin,
      transport,
      access: location,
      device: {
        localEncryptionKeys: hasKeys,
        encryptedServerKeyBackup: hasBackup,
        offlineAppShell: serviceWorker,
      },
      note: 'This report contains readiness metadata only. It does not contain messages, private keys, or backup PINs.',
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qryptchat-sovereignty-report-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyChecklist() {
    try {
      await navigator.clipboard.writeText(`QryptChat resilience checklist\n\n${CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="sovereignty-panel">
      <p className="sovereignty-intro">
        QryptChat is designed to remain useful when a cloud provider, network route, or primary service is unavailable.
        Your encrypted messages stay portable, and your private keys remain under your control.
      </p>
      <div className="sovereignty-status-list">
        <StatusRow label="Message transport" value={transport} detail="Live connection and offline detection" />
        <StatusRow label="Local encryption keys" value={hasKeys ? 'Ready' : 'Needs setup'} detail="Keys stay on this device" />
        <StatusRow label="Encrypted key backup" value={hasBackup ? 'Available' : 'Not configured'} detail="Server stores ciphertext only" />
        <StatusRow label="Offline app shell" value={serviceWorker ? 'Ready' : 'Not installed'} detail="Install the PWA for resilient access" />
      </div>
      <div className="sovereignty-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={downloadReport}>Download readiness report</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyChecklist}>{copied ? 'Checklist copied' : 'Copy resilience checklist'}</button>
      </div>
      <p className="sovereignty-footnote">Access: {location}. Reports never include message contents, private keys, or PINs.</p>
      <style>{`
        .sovereignty-panel { display: flex; flex-direction: column; gap: 1rem; }
        .sovereignty-intro, .sovereignty-footnote { color: var(--color-text-secondary); font-size: .875rem; line-height: 1.55; margin: 0; }
        .sovereignty-status-list { border: 1px solid var(--color-border-primary); border-radius: .75rem; overflow: hidden; }
        .sovereignty-status-row { display: flex; align-items: center; gap: .65rem; padding: .75rem .85rem; border-bottom: 1px solid var(--color-border-primary); }
        .sovereignty-status-row:last-child { border-bottom: 0; }
        .sovereignty-status-row > div { display: flex; flex-direction: column; gap: .15rem; min-width: 0; flex: 1; }
        .sovereignty-status-row small { color: var(--color-text-secondary); font-size: .75rem; }
        .sovereignty-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; flex: 0 0 auto; }
        .sovereignty-dot.is-good { background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,.12); }
        .sovereignty-status-value { color: var(--color-text-secondary); font-size: .75rem; white-space: nowrap; }
        .sovereignty-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
      `}</style>
    </div>
  );
}
