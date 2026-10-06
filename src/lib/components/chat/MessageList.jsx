'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/stores/auth.js';
import { foldMessages } from '@/lib/chat/reactions.js';
import MessageItem from './MessageItem.jsx';
import TypingIndicator from './TypingIndicator.jsx';

export default function MessageList({ conversationId }) {
  const containerRef = useRef(null);
  const lastCount = useRef(0);
  const user = useAuthStore((s) => s.user);
  const { messages, typingUsers, loadMessages, joinConversation, setReplyingTo, sendReaction } = useChatStore(
    useShallow((s) => ({
      messages: s.messages,
      typingUsers: s.typingUsers,
      loadMessages: s.loadMessages,
      joinConversation: s.joinConversation,
      setReplyingTo: s.setReplyingTo,
      sendReaction: s.sendReaction,
    }))
  );

  // Reactions fold into their targets; replies gain a quote from our own copy.
  const folded = useMemo(() => foldMessages(messages, user?.id), [messages, user?.id]);

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    joinConversation(conversationId).then(() => loadMessages(conversationId));
  }, [conversationId, user?.id]);

  // Follow new messages to the bottom, but a reaction on an old one does not yank the view.
  useEffect(() => {
    if (containerRef.current && folded.length !== lastCount.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    lastCount.current = folded.length;
  }, [folded]);

  function jumpTo(id) {
    const el = containerRef.current?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1200);
  }

  return (
    <div className="message-list" ref={containerRef}>
      {folded.length === 0 ? (
        <div className="no-messages">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        folded.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            showAvatar={true}
            showTimestamp={true}
            onReply={() => setReplyingTo(message)}
            onReact={(emoji, remove) => sendReaction(conversationId, message.id, emoji, remove)}
            onJumpTo={jumpTo}
          />
        ))
      )}
      <TypingIndicator typingUsers={typingUsers} />
      <style>{`
        .message-list { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; }
        .no-messages { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--color-text-secondary); font-size: .875rem; }
      `}</style>
    </div>
  );
}
