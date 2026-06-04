'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/stores/auth.js';
import { detectTextFormat } from '@profullstack/text-type-detection';
import { trackMessageSent } from '@/lib/utils/analytics.js';
import { useMessagesStore } from '@/lib/stores/messages.js';

export default function MessageInput({ conversationId, disabled = false }) {
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [encryptionError, setEncryptionError] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const { sendMessage, setTyping, stopTyping } = useChatStore(
    useShallow((s) => ({ sendMessage: s.sendMessage, setTyping: s.setTyping, stopTyping: s.stopTyping }))
  );
  const addMessage = useMessagesStore((s) => s.error);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [messageText]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e) {
    const val = e.target.value;
    setMessageText(val);
    if (conversationId && user?.id) {
      setTyping(conversationId);
    }
  }

  async function handleSend() {
    if (!messageText.trim() || isSending || !conversationId) return;
    setIsSending(true);
    setEncryptionError('');

    try {
      const detection = detectTextFormat(messageText);
      const metadata = detection.text_format === 'ascii' ? { isAsciiArt: true } : null;
      const result = await sendMessage(conversationId, messageText.trim(), 'text', metadata);
      if (result?.success) {
        setMessageText('');
        trackMessageSent({ conversationId, type: 'text' });
      } else {
        setEncryptionError(result?.error || 'Failed to send message');
      }
    } catch (err) {
      setEncryptionError(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (conversationId) stopTyping(conversationId);
    }
  }

  return (
    <div className="message-input-container">
      {encryptionError && (
        <div className="encryption-error">{encryptionError}</div>
      )}
      <div className="message-input-wrapper">
        <button className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => setSelectedFiles([...e.target.files])} />
        <textarea
          ref={textareaRef}
          className="message-textarea"
          value={messageText}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled || isSending}
          rows={1}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={disabled || isSending || !messageText.trim()}
          title="Send message"
        >
          {isSending ? (
            <div className="send-spinner" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>

      <style>{`
        .message-input-container { position: absolute; bottom: 0; left: 0; right: 0; padding: .75rem 1rem; background: var(--color-bg-primary); border-top: 1px solid var(--color-border-primary); z-index: 10; }
        .encryption-error { color: var(--color-error); font-size: .8125rem; margin-bottom: .5rem; padding: .5rem; background: rgba(239,68,68,.1); border-radius: .375rem; }
        .message-input-wrapper { display: flex; align-items: flex-end; gap: .5rem; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); border-radius: 1.5rem; padding: .375rem .375rem .375rem .75rem; }
        .message-textarea { flex: 1; border: none; background: transparent; resize: none; font-size: .9375rem; line-height: 1.5; max-height: 120px; padding: .25rem 0; color: var(--color-text-primary); outline: none; font-family: inherit; }
        .message-textarea::placeholder { color: var(--color-text-muted); }
        .attach-btn, .send-btn { flex-shrink: 0; width: 36px; height: 36px; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .attach-btn { background: transparent; color: var(--color-text-secondary); }
        .attach-btn:hover { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
        .send-btn { background: var(--color-brand-primary); color: white; }
        .send-btn:hover:not(:disabled) { background: var(--color-brand-secondary); }
        .send-btn:disabled { opacity: .5; cursor: not-allowed; }
        .send-spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
