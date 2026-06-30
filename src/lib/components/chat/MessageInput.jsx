'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/stores/chat.js';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/stores/auth.js';
import { detectTextFormat } from '@profullstack/text-type-detection';
import { trackMessageSent } from '@/lib/utils/analytics.js';
import { multiRecipientEncryption } from '@/lib/crypto/multi-recipient-encryption.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];

function getFileExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/** Read a File into a base64 string (browser-safe, chunked to avoid call-stack limits). */
async function fileToBase64(file) {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export default function MessageInput({ conversationId, disabled = false }) {
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const { sendMessage, setTyping, stopTyping, loadMessages } = useChatStore(
    useShallow((s) => ({
      sendMessage: s.sendMessage,
      setTyping: s.setTyping,
      stopTyping: s.stopTyping,
      loadMessages: s.loadMessages,
    }))
  );

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

  function handleFileInput(e) {
    setUploadError('');
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;

    const valid = [];
    for (const file of files) {
      const ext = getFileExtension(file.name);
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        setUploadError(`File type not allowed: ${ext}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`File too large. Maximum size is ${Math.floor(MAX_FILE_SIZE / (1024 * 1024 * 1024))}GB`);
        return;
      }
      if (file.size === 0) {
        setUploadError('File cannot be empty');
        return;
      }
      valid.push(file);
    }
    setSelectedFiles((prev) => [...prev, ...valid]);
  }

  function removeSelectedFile(index) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadFile(file, conversationId, messageId) {
    // Encrypt the full file (filename + content) for every conversation participant.
    const fileContent = await fileToBase64(file);
    const fileMetadata = {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      content: fileContent,
      uploadedAt: new Date().toISOString(),
    };
    await multiRecipientEncryption.initialize();
    const encryptedContents = await multiRecipientEncryption.encryptForConversation(
      conversationId,
      JSON.stringify(fileMetadata)
    );

    // Separately encrypt the lightweight DB metadata (no file bytes).
    const dbMetadata = {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      version: 3,
    };
    const encryptedDbMetadata = await multiRecipientEncryption.encryptForConversation(
      conversationId,
      JSON.stringify(dbMetadata)
    );

    // Step 1: signed upload URL
    const uploadUrlRes = await fetch('/api/files/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, messageId, encryptedMetadata: encryptedDbMetadata }),
    });
    if (!uploadUrlRes.ok) {
      const err = await uploadUrlRes.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to get upload URL for ${file.name}`);
    }
    const { uploadUrl, storagePath, fileId, metadata } = await uploadUrlRes.json();

    // Step 2: PUT encrypted bytes directly to storage
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: JSON.stringify(encryptedContents),
    });
    if (!putRes.ok) {
      throw new Error(`Failed to upload ${file.name} to storage`);
    }

    // Step 3: persist file metadata row
    const completeRes = await fetch('/api/files/upload-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath,
        fileId,
        metadata: { ...metadata, encryptedMetadata: encryptedDbMetadata },
      }),
    });
    if (!completeRes.ok) {
      const err = await completeRes.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to complete upload for ${file.name}`);
    }
    return completeRes.json();
  }

  async function handleSend() {
    if (!conversationId || isSending || isUploadingFiles) return;

    const content = messageText.trim();
    const hasText = content.length > 0;
    const hasFiles = selectedFiles.length > 0;
    if (!hasText && !hasFiles) return;

    setIsSending(true);
    setIsUploadingFiles(hasFiles);
    setUploadError('');

    try {
      if (hasFiles) {
        // Create the carrier message first so uploads can reference its id.
        const messageResult = await sendMessage(conversationId, content || '[File attachment]', 'file');
        if (!messageResult?.success || !messageResult?.data?.id) {
          throw new Error(messageResult?.error || 'Failed to create message for file attachment');
        }
        const messageId = messageResult.data.id;

        await Promise.all(selectedFiles.map((file) => uploadFile(file, conversationId, messageId)));

        try {
          await loadMessages(conversationId);
        } catch {
          // non-fatal: realtime will reconcile
        }

        // The carrier 'file' message mounted (and fetched its attachments)
        // before these uploads finished, so tell it to re-fetch now that the
        // files exist — otherwise it stays empty until a full page refresh.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('attachments:updated', { detail: { messageId } }));
        }
        trackMessageSent({ conversationId, type: 'file', hasAttachments: true });
        setSelectedFiles([]);
        setMessageText('');
      } else {
        const detection = detectTextFormat(content);
        const metadata = detection.text_format === 'ascii' ? { isAsciiArt: true } : null;
        const result = await sendMessage(conversationId, content, 'text', metadata);
        if (result?.success) {
          setMessageText('');
          trackMessageSent({ conversationId, type: 'text' });
        } else {
          setUploadError(result?.error || 'Failed to send message');
        }
      }
    } catch (err) {
      setUploadError(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
      setIsUploadingFiles(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (conversationId) stopTyping(conversationId);
    }
  }

  const canSend = !disabled && !isSending && !isUploadingFiles && (messageText.trim() || selectedFiles.length > 0);

  return (
    <div className="message-input-container">
      {uploadError && <div className="encryption-error">{uploadError}</div>}

      {selectedFiles.length > 0 && (
        <div className="file-preview-list">
          {selectedFiles.map((file, i) => (
            <div key={`${file.name}-${i}`} className={`file-chip${isUploadingFiles ? ' uploading' : ''}`}>
              {isUploadingFiles ? <span className="file-spinner" /> : <span className="file-icon">📎</span>}
              <span className="file-name" title={file.name}>{file.name}</span>
              <span className="file-size">{formatFileSize(file.size)}</span>
              {!isUploadingFiles && (
                <button type="button" className="file-remove" onClick={() => removeSelectedFile(i)} title="Remove">×</button>
              )}
            </div>
          ))}
          {isUploadingFiles && <span className="upload-status">Encrypting &amp; uploading…</span>}
        </div>
      )}

      <div className="message-input-wrapper">
        <button
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploadingFiles}
          title="Attach file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileInput} />
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
          disabled={!canSend}
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
        .file-preview-list { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
        .file-chip { display: flex; align-items: center; gap: .4rem; max-width: 240px; padding: .35rem .5rem; background: var(--color-bg-tertiary); border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: .8125rem; color: var(--color-text-primary); }
        .file-chip.uploading { opacity: .8; }
        .file-icon { flex-shrink: 0; }
        .file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-size { flex-shrink: 0; color: var(--color-text-muted); font-size: .75rem; }
        .file-remove { flex-shrink: 0; background: none; border: none; color: var(--color-text-secondary); font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0 .15rem; }
        .file-remove:hover { color: var(--color-error); }
        .upload-status { font-size: .8125rem; color: var(--color-text-secondary); }
        .file-spinner, .send-spinner { width: 14px; height: 14px; border: 2px solid rgba(127,127,127,.3); border-top-color: var(--color-brand-primary); border-radius: 50%; animation: spin .8s linear infinite; flex-shrink: 0; }
        .send-spinner { border-top-color: white; }
        .message-input-wrapper { display: flex; align-items: flex-end; gap: .5rem; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); border-radius: 1.5rem; padding: .375rem .375rem .375rem .75rem; }
        .message-textarea { flex: 1; border: none; background: transparent; resize: none; font-size: .9375rem; line-height: 1.5; max-height: 120px; padding: .25rem 0; color: var(--color-text-primary); outline: none; font-family: inherit; }
        .message-textarea::placeholder { color: var(--color-text-muted); }
        .attach-btn, .send-btn { flex-shrink: 0; width: 36px; height: 36px; border: none; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
        .attach-btn { background: transparent; color: var(--color-text-secondary); }
        .attach-btn:hover:not(:disabled) { background: var(--color-bg-tertiary); color: var(--color-text-primary); }
        .attach-btn:disabled { opacity: .5; cursor: not-allowed; }
        .send-btn { background: var(--color-brand-primary); color: white; }
        .send-btn:hover:not(:disabled) { background: var(--color-brand-secondary); }
        .send-btn:disabled { opacity: .5; cursor: not-allowed; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
