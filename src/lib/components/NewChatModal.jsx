'use client';

import { useState } from 'react';

export default function NewChatModal({ onClose, onConversationCreated }) {
  const [tab, setTab] = useState('direct');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    const q = e.target.value;
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setSearchResults(data.users || []); }
    } catch {}
  }

  async function handleCreate() {
    if (tab === 'direct' && !selected.length) return;
    if (tab === 'group' && (!groupName.trim() || !selected.length)) return;
    setLoading(true);
    try {
      const body = tab === 'direct'
        ? { type: 'direct', participant_ids: [selected[0].id] }
        : { type: 'group', name: groupName.trim(), participant_ids: selected.map((u) => u.id) };
      const res = await fetch('/api/chat/conversations', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        onConversationCreated?.(data.conversation_id);
      }
    } catch {} finally { setLoading(false); }
  }

  function toggleUser(u) {
    if (tab === 'direct') { setSelected([u]); return; }
    setSelected((prev) => prev.some((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Conversation</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="tab-buttons">
          <button className={`tab-btn${tab === 'direct' ? ' active' : ''}`} onClick={() => { setTab('direct'); setSelected([]); }}>Direct</button>
          <button className={`tab-btn${tab === 'group' ? ' active' : ''}`} onClick={() => { setTab('group'); setSelected([]); }}>Group</button>
        </div>
        <div className="modal-body">
          {tab === 'group' && (
            <input type="text" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="search-input" style={{ marginBottom: '.75rem' }} />
          )}
          <input type="text" placeholder="Search users..." value={searchQuery} onChange={handleSearch} className="search-input" />
          <div className="search-results">
            {searchResults.map((u) => (
              <div key={u.id} className={`user-item${selected.some((s) => s.id === u.id) ? ' selected' : ''}`} onClick={() => toggleUser(u)}>
                <span>{u.display_name || u.username}</span>
                <span className="user-handle">@{u.username}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !selected.length} style={{ width: '100%', marginTop: '.75rem' }}>
            {loading ? 'Creating...' : 'Start Conversation'}
          </button>
        </div>
        <style>{`
          .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 100; }
          .modal-content { background: var(--color-bg-primary); border-radius: 1rem; padding: 1.5rem; width: 100%; max-width: 420px; }
          .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
          .modal-header h3 { font-size: 1.125rem; font-weight: 600; }
          .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
          .tab-buttons { display: flex; gap: .5rem; margin-bottom: 1rem; }
          .tab-btn { flex: 1; padding: .5rem; border: 1px solid var(--color-border-primary); background: var(--color-bg-secondary); border-radius: .375rem; cursor: pointer; font-size: .875rem; }
          .tab-btn.active { background: var(--color-brand-primary); color: white; border-color: var(--color-brand-primary); }
          .search-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); }
          .search-results { margin: .75rem 0; max-height: 200px; overflow-y: auto; }
          .user-item { display: flex; justify-content: space-between; align-items: center; padding: .5rem .75rem; cursor: pointer; border-radius: .375rem; }
          .user-item:hover { background: var(--color-bg-secondary); }
          .user-item.selected { background: var(--color-brand-primary); color: white; }
          .user-handle { font-size: .75rem; opacity: .7; }
        `}</style>
      </div>
    </div>
  );
}
