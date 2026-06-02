'use client';

export default function MLKEMCallInterface({ callManager, callState, onEnd }) {
  if (!callManager || !callState) return null;
  return (
    <div className="mlkem-call">
      <div className="mlkem-call-badge">🔐 ML-KEM Encrypted Call — {callState}</div>
      <button onClick={onEnd}>End Call</button>
      <style>{`.mlkem-call { position: fixed; top: 6rem; left: 50%; transform: translateX(-50%); background: var(--color-brand-primary); color: white; padding: .75rem 1.25rem; border-radius: .75rem; z-index: 999; display: flex; align-items: center; gap: 1rem; } .mlkem-call button { background: var(--color-error); border: none; color: white; padding: .375rem .75rem; border-radius: .375rem; cursor: pointer; }`}</style>
    </div>
  );
}
