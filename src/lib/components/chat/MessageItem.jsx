'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { convertUrlsToLinks } from '@/lib/utils/url-link-converter.js';
import { detectTextFormat } from '@profullstack/text-type-detection';
import MessageAttachments from './MessageAttachments.jsx';
import EmojiPicker, { Icon } from './EmojiPicker.jsx';
import { renderOpenEmoji, isEmojiOnly, artworkKey, emojiSrc } from '@/lib/emoji/openemoji.js';
import { QUICK_REACTIONS, myReaction } from '@/lib/chat/reactions.js';

/** An emoji drawn with our artwork when we have it, else as text. */
function Emoji({ char, size = 18 }) {
  const key = artworkKey(char);
  return key ? <img className="openemoji" src={emojiSrc(key)} alt={char} width={size} height={size} draggable="false" /> : <span>{char}</span>;
}

export default function MessageItem({ message, showAvatar = true, showTimestamp = true, onReply, onReact, onJumpTo }) {
  const user = useAuthStore((s) => s.user);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isOwn = message.sender_id === user?.id;
  const hasAttachments = message.message_type === 'file' || message.has_attachments === true;
  const content = message.content || '';
  // Hide the placeholder caption that the upload flow stores on file messages.
  const showText = content.trim().length > 0 && !(hasAttachments && content.trim() === '[File attachment]');
  const detectedFormat = detectTextFormat(content);
  const isAsciiArt = message.metadata?.isAsciiArt === true || detectedFormat.type === 'ascii-art';
  const isCodeBlock = detectedFormat.type === 'code' || detectedFormat.language !== null;
  // Message content is attacker-controlled. It only ever reaches the HTML sink below through
  // convertUrlsToLinks(), which escapes every character it did not generate itself. Never pass
  // `content` here directly, whatever the detected format says. renderOpenEmoji() runs on that
  // escaped output and only adds <img> tags for emoji it has artwork for.
  const contentWithLinks = renderOpenEmoji(convertUrlsToLinks(content));
  const jumbo = isEmojiOnly(content);
  const mine = myReaction(message);
  const reactions = message.reactions || [];

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getDisplayName(sender) {
    return sender?.display_name || sender?.username || 'Unknown';
  }

  function getInitials(name) {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  /** Signal's rule: tapping your current reaction removes it; anything else replaces it. */
  function react(emoji) {
    setActionsOpen(false);
    setPickerOpen(false);
    onReact?.(emoji, mine === emoji);
  }

  const sender = message.sender;
  const displayName = getDisplayName(sender);
  const initials = getInitials(displayName);

  return (
    <div className={`message-wrapper${isOwn ? ' own' : ''}${actionsOpen ? ' actions-open' : ''}`} data-message-id={message.id}>
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

        {message.replyTo && (
          <button
            type="button"
            className={`message-quote${message.replyTo.missing ? ' missing' : ''}`}
            onClick={() => !message.replyTo.missing && onJumpTo?.(message.replyTo.id)}
            title={message.replyTo.missing ? '' : 'Show the original message'}
          >
            {message.replyTo.name && <span className="quote-name">{message.replyTo.name}</span>}
            {/* The snippet is plain text rendered by React (escaped), never HTML. */}
            <span className="quote-text">{message.replyTo.snippet}</span>
          </button>
        )}

        {showText && (
          <div
            className={`message-bubble${isOwn ? ' own' : ''}${isAsciiArt ? ' ascii-art' : ''}${isCodeBlock ? ' code-block' : ''}${jumbo ? ' jumbo' : ''}`}
            onClick={() => setActionsOpen((v) => !v)}
          >
            {isAsciiArt || isCodeBlock ? (
              <pre className="message-pre">{content}</pre>
            ) : (
              <span dangerouslySetInnerHTML={{ __html: contentWithLinks }} />
            )}
          </div>
        )}

        {hasAttachments && <MessageAttachments messageId={message.id} />}

        {reactions.length > 0 && (
          <div className="message-reactions">
            {reactions.map((r) => (
              <button
                type="button"
                key={r.emoji}
                className={`reaction-chip${r.mine ? ' mine' : ''}`}
                title={r.names.join(', ')}
                aria-label={`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`}
                onClick={() => react(r.emoji)}
              >
                <Emoji char={r.emoji} size={16} />
                {r.count > 1 && <span className="reaction-count">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        {showTimestamp && (
          <div className={`message-time${isOwn ? ' own' : ''}`}>
            {formatTime(message.created_at)}
            {isOwn && <span className="message-status">{message.status === 'read' ? '✓✓' : '✓'}</span>}
          </div>
        )}

        {pickerOpen && <EmojiPicker onPick={react} onClose={() => setPickerOpen(false)} />}
      </div>

      <div className="message-actions" role="toolbar" aria-label="Message actions">
        <div className="quick-reactions">
          {QUICK_REACTIONS.map((e) => (
            <button type="button" key={e} className={`quick-reaction${mine === e ? ' mine' : ''}`} onClick={() => react(e)} aria-label={`React ${e}`}>
              <Emoji char={e} size={20} />
            </button>
          ))}
          <button type="button" className="quick-reaction more emoji-btn" onClick={() => setPickerOpen((v) => !v)} aria-label="More reactions" title="More reactions">
            <Icon name="plus-circle" size={18} />
          </button>
        </div>
        <button
          type="button"
          className="action-btn"
          onClick={() => {
            setActionsOpen(false);
            onReply?.();
          }}
          aria-label="Reply"
          title="Reply"
        >
          <Icon name="reply" size={18} />
        </button>
      </div>

      <style>{`
        .message-wrapper { position: relative; display: flex; gap: .5rem; margin-bottom: .75rem; align-items: flex-end; }
        .message-wrapper.own { flex-direction: row-reverse; }
        .message-wrapper.flash .message-bubble { box-shadow: 0 0 0 2px var(--color-brand-primary); transition: box-shadow .3s; }
        .message-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; flex-shrink: 0; }
        .message-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-initials { width: 100%; height: 100%; background: var(--color-brand-primary); color: white; display: flex; align-items: center; justify-content: center; font-size: .75rem; font-weight: 600; }
        .message-content-wrapper { position: relative; max-width: 70%; display: flex; flex-direction: column; gap: .25rem; }
        .message-wrapper.own .message-content-wrapper { align-items: flex-end; }
        .message-sender { font-size: .75rem; color: var(--color-text-secondary); font-weight: 500; padding-left: .25rem; }
        .message-bubble { padding: .5rem .875rem; border-radius: 1rem; background: var(--color-bg-secondary); color: var(--color-text-primary); font-size: .9375rem; line-height: 1.5; word-break: break-word; }
        .message-bubble.own { background: var(--color-brand-primary); color: white; }
        .message-bubble.ascii-art, .message-bubble.code-block { background: var(--color-bg-tertiary); }
        .message-bubble img.openemoji { width: 1.25em; height: 1.25em; vertical-align: -.25em; margin: 0 .05em; }
        .message-bubble.jumbo { background: transparent; padding: .125rem .25rem; }
        .message-bubble.jumbo img.openemoji { width: 2.75em; height: 2.75em; }
        .message-pre { white-space: pre-wrap; font-family: monospace; font-size: .8125rem; margin: 0; }
        .message-time { font-size: .75rem; color: var(--color-text-muted); padding: 0 .25rem; }
        .message-time.own { text-align: right; }
        .message-status { margin-left: .25rem; }

        .message-quote { display: flex; flex-direction: column; gap: .1rem; max-width: 100%; text-align: left; padding: .35rem .65rem; border: none; border-left: 3px solid var(--color-brand-primary); border-radius: .5rem; background: var(--color-bg-tertiary); color: var(--color-text-secondary); font: inherit; font-size: .8125rem; cursor: pointer; }
        .message-quote.missing { cursor: default; font-style: italic; }
        .quote-name { font-weight: 600; color: var(--color-text-primary); font-size: .75rem; }
        .quote-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .message-reactions { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: -.15rem; }
        .reaction-chip { display: inline-flex; align-items: center; gap: .2rem; padding: .1rem .45rem; border-radius: 999px; border: 1px solid var(--color-border-primary); background: var(--color-bg-primary); color: var(--color-text-primary); font-size: .75rem; cursor: pointer; line-height: 1.4; }
        .reaction-chip.mine { border-color: var(--color-brand-primary); background: color-mix(in srgb, var(--color-brand-primary) 15%, var(--color-bg-primary)); }
        .reaction-chip img.openemoji { display: block; }

        .message-actions { display: none; align-items: center; gap: .25rem; align-self: center; }
        .message-wrapper:hover .message-actions, .message-wrapper.actions-open .message-actions, .message-actions:focus-within { display: flex; }
        .quick-reactions { display: flex; align-items: center; gap: .1rem; padding: .15rem .3rem; border: 1px solid var(--color-border-primary); border-radius: 999px; background: var(--color-bg-primary); box-shadow: 0 2px 8px rgba(0,0,0,.12); }
        .quick-reaction, .action-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: none; border-radius: 50%; background: transparent; color: var(--color-text-secondary); cursor: pointer; }
        .quick-reaction:hover, .action-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
        .quick-reaction.mine { background: var(--color-bg-tertiary); }
        .quick-reaction img.openemoji { display: block; transition: transform .1s; }
        .quick-reaction:hover img.openemoji { transform: scale(1.2); }
        .message-content-wrapper .emoji-picker { left: 0; right: auto; }
        .message-wrapper.own .message-content-wrapper .emoji-picker { left: auto; right: 0; }
        @media (max-width: 640px) { .message-actions { position: absolute; bottom: 100%; z-index: 5; } .message-wrapper.own .message-actions { right: 0; } }
      `}</style>
    </div>
  );
}
