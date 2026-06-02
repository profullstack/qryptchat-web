'use client';

export default function GroupItem({ group, isActive, onSelect }) {
  const name = group.name || group.conversation_name || 'Group';
  const unread = group.unread_count || 0;

  return (
    <div
      className={`conversation-item${isActive ? ' active' : ''}`}
      onClick={() => onSelect?.(group.id)}
    >
      <div className="conv-avatar">
        <div className="conv-avatar-placeholder group-avatar">
          {name.charAt(0).toUpperCase()}
        </div>
        {unread > 0 && <div className="unread-badge">{unread > 99 ? '99+' : unread}</div>}
      </div>
      <div className="conv-info">
        <div className="conv-name-row">
          <span className="conv-name">{name}</span>
          <span className="group-badge">Group</span>
        </div>
        {group.last_message_preview && (
          <div className="conv-preview">{group.last_message_preview}</div>
        )}
      </div>
    </div>
  );
}
