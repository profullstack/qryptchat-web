'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { useChatStore } from '@/lib/stores/chat.js';
import ConversationItem from './ConversationItem.jsx';
import ConversationMenu from './chat/ConversationMenu.jsx';
import NewChatModal from './NewChatModal.jsx';

export default function ChatSidebar({ activeConversationId, onConversationSelect }) {
  const user = useAuthStore((s) => s.user);
  const authenticated = useChatStore((s) => s.authenticated);
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0, conversation: null });
  const hasLoadedRef = useRef(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    if (authenticated && user?.id && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadConversations();
    }
  }, [authenticated, user?.id]);

  useEffect(() => {
    if (authenticated && user?.id) {
      pollingRef.current = setInterval(loadConversations, 10000);
    }
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [authenticated, user?.id]);

  async function loadConversations() {
    try {
      setLoading(true);
      const response = await fetch('/api/chat/conversations', { credentials: 'include' });
      if (response.ok) {
        const { conversations: data } = await response.json();
        setConversations(data || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = conversations.filter((conv) => {
    const matchesArchive = showArchived ? conv.is_archived === true : conv.is_archived !== true;
    const matchesSearch = !searchQuery ||
      (conv.name || conv.conversation_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesArchive && matchesSearch;
  });

  const noteToSelf = filtered.filter((c) => c.type === 'note_to_self');
  const directMessages = filtered.filter((c) => c.type === 'direct');
  const groups = filtered.filter((c) => c.type === 'group');
  const archivedCount = conversations.filter((c) => c.is_archived).length;

  function handleContextMenu(e, conv) {
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, conversation: conv });
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Chats</h2>
        <button className="new-chat-btn" onClick={() => setShowNewChatModal(true)} title="New chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="sidebar-content">
        {loading && conversations.length === 0 && (
          <div className="sidebar-loading">Loading conversations...</div>
        )}

        {noteToSelf.length > 0 && (
          <div className="conv-section">
            <div className="section-label">Notes</div>
            {noteToSelf.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversationId === conv.id}
                onSelect={onConversationSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}

        {directMessages.length > 0 && (
          <div className="conv-section">
            <div className="section-label">Direct Messages</div>
            {directMessages.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversationId === conv.id}
                onSelect={onConversationSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}

        {groups.length > 0 && (
          <div className="conv-section">
            <div className="section-label">Groups</div>
            {groups.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={activeConversationId === conv.id}
                onSelect={onConversationSelect}
                onContextMenu={handleContextMenu}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="sidebar-empty">
            <p>No conversations yet.</p>
            <button className="btn btn-primary" onClick={() => setShowNewChatModal(true)}>Start a chat</button>
          </div>
        )}

        {archivedCount > 0 && (
          <button className="archived-toggle" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide archived' : `${archivedCount} archived`}
          </button>
        )}
      </div>

      {contextMenu.show && (
        <ConversationMenu
          conversation={contextMenu.conversation}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu({ show: false, x: 0, y: 0, conversation: null })}
        />
      )}

      {showNewChatModal && (
        <NewChatModal onClose={() => setShowNewChatModal(false)} onConversationCreated={(id) => { setShowNewChatModal(false); onConversationSelect?.(id); loadConversations(); }} />
      )}

      <style>{`
        .sidebar { width: 320px; min-width: 280px; display: flex; flex-direction: column; height: 100%; background: var(--color-bg-primary); border-right: 1px solid var(--color-border-primary); }
        .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--color-border-primary); }
        .sidebar-title { font-size: 1.25rem; font-weight: 700; color: var(--color-text-primary); }
        .new-chat-btn { width: 36px; height: 36px; border: none; background: var(--color-brand-primary); color: white; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .sidebar-search { padding: .75rem 1rem; }
        .search-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); font-size: .875rem; outline: none; }
        .search-input:focus { border-color: var(--color-brand-primary); }
        .sidebar-content { flex: 1; overflow-y: auto; }
        .sidebar-loading { padding: 1rem; text-align: center; color: var(--color-text-secondary); font-size: .875rem; }
        .sidebar-empty { padding: 2rem 1rem; text-align: center; color: var(--color-text-secondary); }
        .sidebar-empty p { margin-bottom: 1rem; }
        .conv-section { margin-bottom: .5rem; }
        .section-label { padding: .375rem 1rem; font-size: .75rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em; }
        .archived-toggle { width: 100%; padding: .75rem 1rem; background: none; border: none; border-top: 1px solid var(--color-border-primary); color: var(--color-brand-primary); cursor: pointer; font-size: .875rem; text-align: left; }
        @media (max-width: 768px) { .sidebar { width: 100%; } }
      `}</style>
    </div>
  );
}
