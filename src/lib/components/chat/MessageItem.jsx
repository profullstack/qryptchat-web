'use client';

import { useAuthStore } from '@/lib/stores/auth.js';
import { convertUrlsToLinks } from '@/lib/utils/url-link-converter.js';
import { detectTextFormat } from '@profullstack/text-type-detection';
import MessageAttachments from './MessageAttachments.jsx';

export default function MessageItem({ message, showAvatar = true, showTimestamp = true }) {
  const user = useAuthStore((s) => s.user);

  const isOwn = message.sender_id === user?.id;
  const hasAttachments = message.message_type === 'file' || message.has_attachments === true;
  const content = message.content || '';
  // Hide the placeholder caption that the upload flow stores on file messages.
  const showText = content.trim().length > 0 && !(hasAttachments && content.trim() === '[File attachment]');
  const detectedFormat = detectTextFormat(content);
  const isAsciiArt = message.metadata?.isAsciiArt === true || detectedFormat.type === 'ascii-art';
  const isCodeBlock = detectedFormat.type === 'code' || detectedFormat.language !== null;
  const contentWithLinks = detectedFormat.type === 'plain' ? convertUrlsToLinks(content) : content;

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getDisplayName(sender) {
    return sender?.display_name || sender?.username || 'Unknown';
  }

  function getInitials(name) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  const sender = message.sender;
  const displayName = getDisplayName(sender);
  const initials = getInitials(displayName);

  return (
    <div className={`message-wrapper${isOwn ? ' own' : ''}`}>
      {!isOwn && showAvatar && (
        <div className="message-avatar">
          {sender?.avatar_url ? (
            <img src={sender.avatar_url} alt={displayName} />
          ) : (
            <div className="avatar-initials">{initials}</div>
          )}
        </div>
      )}

      <div className="message-content-wrapper">
        {!isOwn && <div className="message-sender">{displayName}</div>}

        {showText && (
          <div className={`message-bubble${isOwn ? ' own' : ''}${isAsciiArt ? ' ascii-art' : ''}${isCodeBlock ? ' code-block' : ''}`}>
            {isAsciiArt || isCodeBlock ? (
              <pre className="message-pre">{content}</pre>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: contentWithLinks }} />
            )}
          </div>
        )}

        {hasAttachments && <MessageAttachments messageId={message.id} />}

        {showTimestamp && (
          <div className={`message-time${isOwn ? ' own' : ''}`}>
            {formatTime(message.created_at)}
            {isOwn && <span className="message-status">{message.status === 'read' ? '✓✓' : '✓'}</span>}
          </div>
        )}
      </div>

      <style>{`
        .message-wrapper { display: flex; gap: .5rem; margin-bottom: .75rem; align-items: flex-end; }
        .message-wrapper.own { flex-direction: row-reverse; }
        .message-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
        .message-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-initials { width: 100%; height: 100%; background: var(--color-brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 600; }
        .message-content-wrapper { max-width: 70%; display: flex; flex-direction: column; gap: .25rem; }
        .message-sender { font-size: .75rem; color: var(--color-text-secondary); font-weight: 500; padding-left: .25rem; }
        .message-bubble { padding: .5rem .875rem; border-radius: 1rem; background: var(--color-bg-secondary); color: var(--color-text-primary); font-size: .9375rem; line-height: 1.5; word-break: break-word; }
        .message-bubble.own { background: var(--color-brand-primary); color: white; }
        .message-bubble.ascii-art, .message-bubble.code-block { background: var(--color-bg-tertiary); }
        .message-pre { white-space: pre-wrap; font-family: monospace; font-size: .8125rem; margin: 0; }
        .message-time { font-size: .75rem; color: var(--color-text-muted); padding: 0 .25rem; }
        .message-time.own { text-align: right; }
        .message-status { margin-left: .25rem; }
      `}</style>
    </div>
  );
}
