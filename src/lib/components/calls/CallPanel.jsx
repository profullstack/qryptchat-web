'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';

/**
 * The call this tab is in, end-to-end encrypted on PairUX's SFU. The media key
 * came from an ML-KEM-encrypted 'call' message; @profullstack/pairux-embed
 * encrypts every frame with it before it leaves this browser, so neither
 * qrypt.chat nor PairUX can hear or see the call. A browser that cannot do that
 * is told so; it never falls back to an unencrypted call.
 */
export default function CallPanel() {
  const activeCall = useChatStore((s) => s.activeCall);
  const endCall = useChatStore((s) => s.endCall);
  const hostRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeCall || !hostRef.current) return;
    let call;
    let ui;
    let cancelled = false;
    setError('');
    (async () => {
      try {
        const session = JSON.parse(localStorage.getItem('qrypt_session') || '{}');
        const res = await fetch('/api/calls/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          credentials: 'include',
          body: JSON.stringify({ conversationId: activeCall.conversationId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not start the call');
        const { PairuxCall, mountCall } = await import('@profullstack/pairux-embed');
        if (cancelled) return;
        call = new PairuxCall({ url: data.url, token: data.token, iceServers: data.iceServers, key: activeCall.key });
        ui = mountCall(hostRef.current, call, { onLeave: endCall });
        await call.join({ audio: true, video: !!activeCall.video });
      } catch (err) {
        if (!cancelled) setError(err?.message || 'The call failed');
      }
    })();
    return () => {
      cancelled = true;
      ui?.destroy();
      call?.leave().catch(() => {});
    };
  }, [activeCall, endCall]);

  if (!activeCall) return null;

  return (
    <div className="call-overlay" role="dialog" aria-label="Call">
      <div className="call-frame">
        <div className="call-bar">
          <span className="call-title">🔒 End-to-end encrypted {activeCall.video ? 'video' : 'voice'} call</span>
          <button type="button" className="call-close" onClick={endCall} aria-label="Leave call">×</button>
        </div>
        {error ? <p className="call-error">{error}</p> : <div className="call-host" ref={hostRef} />}
        <p className="call-note">Calls run on PairUX. Every audio and video frame is encrypted on your device with a key only this conversation holds.</p>
      </div>
      <style>{`
        .call-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .call-frame { width: min(960px, 100%); height: min(640px, 100%); display: flex; flex-direction: column; gap: .5rem; background: var(--color-bg-primary); border-radius: 1rem; padding: .75rem; box-shadow: 0 20px 60px rgba(0,0,0,.4); }
        .call-bar { display: flex; align-items: center; justify-content: space-between; }
        .call-title { font-weight: 600; font-size: .9rem; color: var(--color-text-primary); }
        .call-close { background: none; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: var(--color-text-secondary); }
        .call-host { flex: 1; min-height: 0; --pxe-accent: var(--color-brand-primary); }
        .call-error { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; color: var(--color-error); padding: 2rem; }
        .call-note { margin: 0; font-size: .75rem; color: var(--color-text-muted); text-align: center; }
      `}</style>
    </div>
  );
}
