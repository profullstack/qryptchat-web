'use client';

import { useAuthStore } from '@/lib/stores/auth.js';

export default function ConversationItem({ conversation, isActive, onSelect, onContextMenu }) {
  const user = useAuthStore((s) => s.user);

  const name = conversation.name || conversation.conversation_name ||
    (conversation.participants?.find((p) => p.id !== user?.id)?.username || 'Chat');
  const unread = conversation.unread_count || 0;
  const lastMessage = conversation.last_message_preview || '';
  const lastTime = conversation.last_message_at
    ? new Date(conversation.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className={`conversation-item${isActive ? ' active' : ''}`}
      onClick={() => onSelect?.(conversation.id)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, conversation); }}
    >
      <div className="conv-avatar">
        {conversation.avatar_url ? (
          <img src={conversation.avatar_url} alt={name} />
        ) : (
          <div className="conv-avatar-placeholder">{name.charAt(0).toUpperCase()}</div>
        )}
        {unread > 0 && <div className="unread-badge">{unread > 99 ? '99+' : unread}</div>}
      </div>
      <div className="conv-info">
        <div className="conv-name-row">
          <span className="conv-name">{name}</span>
          {lastTime && <span className="conv-time">{lastTime}</span>}
        </div>
        {lastMessage && (
          <div className="conv-preview">{lastMessage}</div>
        )}
      </div>

      <style>{`
        .conversation-item { display: flex; align-items: center; gap: .75rem; padding: .75rem 1rem; cursor: pointer; border-radius: .5rem; transition: background-color .15s; position: relative; }
        .conversation-item:hover { background-color: var(--color-bg-secondary); }
        .conversation-item.active { background-color: var(--color-brand-primary); }
        .conversation-item.active .conv-name, .conversation-item.active .conv-preview, .conversation-item.active .conv-time { color: white; }
        .conv-avatar { position: relative; flex-shrink: 0; width: 44px; height: 44px; border-radius: 50%; overflow: hidden; }
        .conv-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .conv-avatar-placeholder { width: 100%; height: 100%; background: var(--color-brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 1.125rem; }
        .conversation-item.active .conv-avatar-placeholder { background: rgba(255,255,255,.2); }
        .unread-badge { position: absolute; top: -2px; right: -2px; background: var(--color-error); color: white; font-size: .625rem; font-weight: 700; border-radius: 9999px; min-width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; padding: 0 .25rem; }
        .conv-info { flex: 1; min-width: 0; }
        .conv-name-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: .125rem; }
        .conv-name { font-weight: 600; font-size: .9375rem; color: var(--color-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .conv-time { font-size: .75rem; color: var(--color-text-muted); flex-shrink: 0; }
        .conv-preview { font-size: .8125rem; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </div>
  );
}
