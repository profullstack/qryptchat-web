'use client';

import { useVoiceCallStore } from '@/lib/stores/voice-call.js';
import { useShallow } from 'zustand/react/shallow';

export default function IncomingCallModal() {
  const { currentCall, acceptCall, endCall } = useVoiceCallStore(
    useShallow((s) => ({ currentCall: s.currentCall, acceptCall: s.acceptCall, endCall: s.endCall }))
  );

  if (!currentCall || !currentCall.isIncoming || currentCall.state !== 'ringing') return null;

  return (
    <div className="incoming-call-modal">
      <div className="call-card">
        <div className="call-avatar">
          {currentCall.participantAvatar ? (
            <img src={currentCall.participantAvatar} alt={currentCall.participantName} />
          ) : (
            <div className="call-avatar-placeholder">{currentCall.participantName.charAt(0).toUpperCase()}</div>
          )}
        </div>
        <div className="call-info">
          <p className="call-type">{currentCall.type === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call'}</p>
          <h3 className="caller-name">{currentCall.participantName}</h3>
        </div>
        <div className="call-actions">
          <button className="call-accept" onClick={() => acceptCall(currentCall.id)}>Accept</button>
          <button className="call-decline" onClick={() => endCall(currentCall.id)}>Decline</button>
        </div>
      </div>
      <style>{`
        .incoming-call-modal { position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 1000; animation: slideIn .3s ease; }
        .call-card { background: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: 1rem; padding: 1.25rem; box-shadow: var(--shadow-xl); min-width: 280px; }
        .call-avatar { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; margin: 0 auto 1rem; }
        .call-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .call-avatar-placeholder { width: 100%; height: 100%; background: var(--color-brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; }
        .call-info { text-align: center; margin-bottom: 1rem; }
        .call-type { font-size: .875rem; color: var(--color-text-secondary); margin-bottom: .25rem; }
        .caller-name { font-size: 1.125rem; font-weight: 600; color: var(--color-text-primary); }
        .call-actions { display: flex; gap: .75rem; }
        .call-accept { flex: 1; padding: .75rem; background: var(--color-success); color: white; border: none; border-radius: .5rem; cursor: pointer; font-weight: 600; }
        .call-decline { flex: 1; padding: .75rem; background: var(--color-error); color: white; border: none; border-radius: .5rem; cursor: pointer; font-weight: 600; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
