'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';

export default function ConversationMenu({ conversation, position, onClose }) {
  const ref = useRef(null);
  const { archiveConversation, unarchiveConversation, deleteConversation } = useChatStore((s) => ({
    archiveConversation: s.archiveConversation,
    unarchiveConversation: s.unarchiveConversation,
    deleteConversation: s.deleteConversation,
  }));

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  async function handleArchive() {
    if (conversation.is_archived) {
      await unarchiveConversation(conversation.id);
    } else {
      await archiveConversation(conversation.id);
    }
    onClose?.();
  }

  async function handleDelete() {
    if (confirm('Delete this conversation? This cannot be undone.')) {
      await deleteConversation(conversation.id);
      onClose?.();
    }
  }

  if (!conversation) return null;

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ position: 'fixed', top: position.y, left: position.x, zIndex: 1000 }}
    >
      <button className="context-menu-item" onClick={handleArchive}>
        {conversation.is_archived ? 'Unarchive' : 'Archive'}
      </button>
      {conversation.type !== 'note_to_self' && (
        <button className="context-menu-item danger" onClick={handleDelete}>Delete</button>
      )}
      <style>{`
        .context-menu { background: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: .5rem; box-shadow: var(--shadow-lg); overflow: hidden; min-width: 150px; }
        .context-menu-item { display: block; width: 100%; padding: .625rem 1rem; text-align: left; background: none; border: none; cursor: pointer; font-size: .875rem; color: var(--color-text-primary); transition: background-color .15s; }
        .context-menu-item:hover { background-color: var(--color-bg-secondary); }
        .context-menu-item.danger { color: var(--color-error); }
        .context-menu-item.danger:hover { background-color: rgba(239,68,68,.1); }
      `}</style>
    </div>
  );
}
