'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { useAuthStore } from '@/lib/stores/auth.js';
import MessageItem from './MessageItem.jsx';
import TypingIndicator from './TypingIndicator.jsx';

export default function MessageList({ conversationId }) {
  const containerRef = useRef(null);
  const user = useAuthStore((s) => s.user);
  const { messages, typingUsers, loadMessages, joinConversation } = useChatStore((s) => ({
    messages: s.messages,
    typingUsers: s.typingUsers,
    loadMessages: s.loadMessages,
    joinConversation: s.joinConversation,
  }));

  useEffect(() => {
    if (!conversationId || !user?.id) return;
    joinConversation(conversationId).then(() => loadMessages(conversationId));
  }, [conversationId, user?.id]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="message-list" ref={containerRef}>
      {messages.length === 0 ? (
        <div className="no-messages">
          <p>No messages yet. Start the conversation!</p>
        </div>
      ) : (
        messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            showAvatar={true}
            showTimestamp={true}
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
