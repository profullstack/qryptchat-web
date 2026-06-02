'use client';

import { useState } from 'react';

export default function AddParticipantModal({ isOpen, conversationId, onClose, onParticipantsAdded }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSearch(e) {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setSearchResults(data.users || []); }
    } catch {}
  }

  async function handleAdd() {
    if (!selected.length) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations/${conversationId}/participants`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participant_ids: selected.map((u) => u.id) }),
      });
      if (res.ok) onParticipantsAdded?.();
    } catch {} finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Participants</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input type="text" placeholder="Search users..." value={searchQuery} onChange={handleSearch} className="search-input" />
          <div className="search-results">
            {searchResults.map((u) => (
              <div key={u.id} className={`user-item${selected.some((s) => s.id === u.id) ? ' selected' : ''}`} onClick={() => setSelected((prev) => prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u])}>
                <span>{u.display_name || u.username}</span>
              </div>
            ))}
          </div>
          {selected.length > 0 && (
            <button className="btn btn-primary" onClick={handleAdd} disabled={loading}>
              {loading ? 'Adding...' : `Add ${selected.length} participant${selected.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
        <style>{`
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background: var(--color-bg-primary); border-radius: 1rem; padding: 1.5rem; width: 100%; max-width: 400px; }
          .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
          .modal-header h3 { font-size: 1.125rem; font-weight: 600; }
          .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
          .search-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); }
          .search-results { margin: .75rem 0; max-height: 200px; overflow-y: auto; }
          .user-item { padding: .5rem .75rem; cursor: pointer; border-radius: .375rem; }
          .user-item:hover { background: var(--color-bg-secondary); }
          .user-item.selected { background: var(--color-brand-primary); color: white; }
        `}</style>
      </div>
    </div>
  );
}
