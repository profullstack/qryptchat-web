'use client';

import { useState } from 'react';

export default function JoinGroupModal({ onClose, onJoined }) {
  const [groupCode, setGroupCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin(e) {
    e.preventDefault();
    if (!groupCode.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/conversations/join', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: groupCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) onJoined?.(data.conversation_id);
      else setError(data.error || 'Failed to join group');
    } catch { setError('Failed to join group'); } finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Join Group</h3><button onClick={onClose}>×</button></div>
        <form onSubmit={handleJoin}>
          <div className="input-group">
            <label>Group Code or Invite Link</label>
            <input type="text" value={groupCode} onChange={(e) => setGroupCode(e.target.value)} placeholder="Enter group code..." required />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Joining...' : 'Join Group'}
          </button>
        </form>
        <style>{`
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background: var(--color-bg-primary); border-radius: 1rem; padding: 1.5rem; width: 100%; max-width: 400px; }
          .modal-header { display: flex; justify-content: space-between; margin-bottom: 1rem; }
          .input-group { margin-bottom: 1rem; }
          .input-group label { display: block; margin-bottom: .5rem; font-weight: 500; }
          .input-group input { width: 100%; padding: .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); }
          .error { color: var(--color-error); font-size: .875rem; margin-bottom: .75rem; }
        `}</style>
      </div>
    </div>
  );
}
