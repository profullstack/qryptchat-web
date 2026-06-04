'use client';

import { useVoiceCallStore } from '@/lib/stores/voice-call.js';
import { useShallow } from 'zustand/react/shallow';

export default function ActiveCallInterface() {
  const { currentCall, callStats, toggleMute, toggleVideo, endCall } = useVoiceCallStore(
    useShallow((s) => ({ currentCall: s.currentCall, callStats: s.callStats, toggleMute: s.toggleMute, toggleVideo: s.toggleVideo, endCall: s.endCall }))
  );

  if (!currentCall || !['connecting', 'connected', 'calling'].includes(currentCall.state)) return null;

  const formatDuration = useVoiceCallStore.getState().formatDuration;
  const duration = formatDuration(callStats.duration);

  return (
    <div className="active-call">
      <div className="call-bar">
        <div className="call-participant">
          <span className="call-dot" />
          <span className="call-name">{currentCall.participantName}</span>
          <span className="call-duration">{currentCall.state === 'connected' ? duration : currentCall.state}</span>
        </div>
        <div className="call-controls">
          <button className={`call-ctrl${currentCall.isMuted ? ' active' : ''}`} onClick={toggleMute} title="Toggle mute">🎙️</button>
          {currentCall.type === 'video' && (
            <button className={`call-ctrl${!currentCall.isVideoEnabled ? ' active' : ''}`} onClick={toggleVideo} title="Toggle video">📹</button>
          )}
          <button className="call-ctrl end-call" onClick={() => endCall(currentCall.id)} title="End call">📵</button>
        </div>
      </div>
      <style>{`
        .active-call { position: fixed; top: 5rem; right: 1rem; z-index: 999; }
        .call-bar { background: var(--color-brand-primary); color: white; border-radius: .75rem; padding: .75rem 1rem; display: flex; align-items: center; gap: 1rem; box-shadow: var(--shadow-lg); min-width: 250px; }
        .call-participant { display: flex; align-items: center; gap: .5rem; flex: 1; }
        .call-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 1.5s infinite; }
        .call-name { font-weight: 600; font-size: .875rem; }
        .call-duration { font-size: .75rem; opacity: .8; margin-left: auto; }
        .call-controls { display: flex; gap: .375rem; }
        .call-ctrl { background: rgba(255,255,255,.2); border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: .875rem; display: flex; align-items: center; justify-content: center; }
        .call-ctrl.active { background: rgba(255,255,255,.4); }
        .end-call { background: rgba(239,68,68,.7); }
        .end-call:hover { background: #ef4444; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}
