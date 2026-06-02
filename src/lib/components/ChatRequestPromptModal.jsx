'use client';

export default function ChatRequestPromptModal({ request, onAccept, onDecline }) {
  if (!request) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Chat Request</h3>
        <p><strong>{request.fromName}</strong> wants to start a chat with you.</p>
        <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={onAccept}>Accept</button>
          <button className="btn btn-secondary" onClick={onDecline}>Decline</button>
        </div>
        <style>{`
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background: var(--color-bg-primary); border-radius: 1rem; padding: 1.5rem; max-width: 400px; width: 100%; }
        `}</style>
      </div>
    </div>
  );
}
