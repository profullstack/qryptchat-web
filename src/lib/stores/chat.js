import { create } from 'zustand';
import { MESSAGE_TYPES } from '@/lib/api/protocol.js';
import { updateAppBadge } from '@/lib/utils/badge.js';
import { multiRecipientEncryption } from '@/lib/crypto/multi-recipient-encryption.js';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';
import { publicKeyService } from '@/lib/crypto/public-key-service.js';
import * as conversationUtils from '@/lib/utils/conversation-utils.js';

export const useChatStore = create((set, get) => {
  let eventSource = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  let reconnectDelay = 1000;
  const maxReconnectDelay = 30000;
  let typingTimeout = null;
  let reconnectTimeout = null;
  let connectionToken = null;

  async function apiPost(endpoint, data = {}) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  function scheduleReconnection() {
    reconnectAttempts++;
    const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), maxReconnectDelay);
    reconnectTimeout = setTimeout(() => {
      if (connectionToken) connectFn(connectionToken);
    }, delay);
  }

  async function connectFn(token) {
    if (typeof window === 'undefined') return;
    connectionToken = token;
    if (eventSource?.readyState === EventSource.OPEN) return;
    if (eventSource) eventSource.close();

    try {
      eventSource = new EventSource('/api/events');

      eventSource.addEventListener('open', async () => {
        reconnectAttempts = 0;
        if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
        set({ connected: true, error: null });
        await multiRecipientEncryption.initialize();
        await publicKeyService.initialize();
        await publicKeyService.initializeUserEncryption();
        set({ authenticated: true });
      });

      eventSource.addEventListener('CONNECTED', () => {});

      eventSource.addEventListener(MESSAGE_TYPES.NEW_MESSAGE, (event) => {
        const data = JSON.parse(event.data);
        handleNewMessage(data.data).catch(console.error);
      });

      eventSource.addEventListener(MESSAGE_TYPES.USER_TYPING, (event) => {
        const data = JSON.parse(event.data);
        handleTypingUpdate(data.data);
      });

      eventSource.addEventListener(MESSAGE_TYPES.CONVERSATION_CREATED, () => {
        get().loadConversations();
      });

      eventSource.addEventListener('error', () => {
        if (eventSource?.readyState === EventSource.CLOSED) {
          set({ connected: false, authenticated: false });
          if (connectionToken && reconnectAttempts < maxReconnectAttempts) {
            scheduleReconnection();
          } else if (reconnectAttempts >= maxReconnectAttempts) {
            set({ error: 'Connection failed after multiple attempts. Please refresh.' });
          }
        }
      });
    } catch {
      set({ error: 'Failed to connect', connected: false });
      if (connectionToken && reconnectAttempts < maxReconnectAttempts) scheduleReconnection();
    }
  }

  async function handleNewMessage(messagePayload) {
    const message = messagePayload.message;
    const { activeConversation } = get();

    if (messagePayload.shouldReloadMessages) {
      if (activeConversation === message.conversation_id) {
        await get().loadMessages(message.conversation_id);
      } else {
        await get().loadConversations();
      }
      return;
    }

    if (message.encrypted_content) {
      try {
        message.content = await postQuantumEncryption.decryptFromSender(message.encrypted_content, '');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Algorithm mismatch') || msg.includes('invalid encapsulation key')) {
          message.content = '[Message encrypted with incompatible keys - please ask sender to resend]';
        } else {
          message.content = '[Message content unavailable - please ask sender to resend]';
        }
      }
    } else {
      message.content = message.content || '[No content]';
    }

    set((state) => {
      if (state.activeConversation === message.conversation_id) {
        if (!state.messages.some((m) => m.id === message.id)) {
          return { messages: [...state.messages, message] };
        }
      }
      return {};
    });
  }

  function handleTypingUpdate(typingData) {
    const { userId, username, displayName, isTyping } = typingData;
    set((state) => {
      let newTypingUsers = [...state.typingUsers];
      if (isTyping) {
        if (!newTypingUsers.some((u) => u.id === userId)) {
          newTypingUsers.push({ id: userId, username: username || 'Someone', display_name: displayName || username || null });
        }
      } else {
        newTypingUsers = newTypingUsers.filter((u) => u.id !== userId);
      }
      return { typingUsers: newTypingUsers };
    });
  }

  return {
    conversations: [],
    groups: [],
    activeConversation: null,
    messages: [],
    loading: false,
    error: null,
    typingUsers: [],
    connected: false,
    authenticated: false,
    user: null,

    connect: connectFn,

    disconnect() {
      if (eventSource) { eventSource.close(); eventSource = null; }
      if (reconnectTimeout) { clearTimeout(reconnectTimeout); reconnectTimeout = null; }
      set({ connected: false, authenticated: false, user: null });
    },

    async loadConversations() {
      try {
        set({ loading: true });
        const response = await apiPost('/api/conversations/load');
        if (response.success) {
          set({ conversations: response.conversations, loading: false, error: null });
          if (typeof window !== 'undefined') {
            try {
              const archivedIds = (response.conversations || []).filter((c) => c.is_archived).map((c) => c.id);
              caches.open('settings-cache').then((cache) =>
                cache.put('archived-conversations', new Response(JSON.stringify(archivedIds)))
              );
            } catch {}
          }
        }
      } catch {
        set({ loading: false, error: 'Failed to load conversations' });
      }
    },

    async joinConversation(conversationId) {
      try {
        const response = await apiPost('/api/conversations/join', { conversationId });
        if (response.success) {
          try { await publicKeyService.initializeUserEncryption(); } catch {}
        }
      } catch {
        set({ error: 'Failed to join conversation' });
      }
    },

    async loadMessages(conversationId) {
      try {
        set({ loading: true });
        const response = await apiPost('/api/messages/load', { conversationId });
        if (response.success) {
          const msgs = response.messages || [];
          for (const message of msgs) {
            if (message.encrypted_content) {
              try {
                message.content = await postQuantumEncryption.decryptFromSender(message.encrypted_content, '');
              } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                if (errMsg.includes('Algorithm mismatch') || errMsg.includes('invalid encapsulation key') || errMsg.includes('invalid ciphertext')) {
                  message.content = '🔒 Cannot decrypt — this message was encrypted for a different device.';
                } else {
                  message.content = '🔒 Cannot decrypt — you may need to import your keys from Settings.';
                }
              }
            } else {
              message.content = '[No content]';
            }
          }
          set({ activeConversation: conversationId, messages: msgs, loading: false, error: null, typingUsers: [] });
        }
      } catch {
        set({ loading: false, error: 'Failed to load messages' });
      }
    },

    async sendMessage(conversationId, content, messageType = 'text', metadata = null, replyToId = null) {
      try {
        const encryptedContents = await multiRecipientEncryption.encryptForConversation(conversationId, content);
        const payload = { conversationId, encryptedContents, messageType };
        if (metadata) payload.metadata = metadata;
        if (replyToId) payload.replyToId = replyToId;
        const response = await apiPost('/api/messages/send', payload);
        if (response.success) {
          const sentMessage = response.message;
          if (sentMessage.encrypted_content) {
            try {
              sentMessage.content = await postQuantumEncryption.decryptFromSender(sentMessage.encrypted_content, '');
            } catch {
              sentMessage.content = content;
            }
          } else {
            sentMessage.content = content;
          }
          return { success: true, data: sentMessage };
        }
      } catch (error) {
        let errorMessage = 'Failed to send message';
        if (error?.message) {
          if (error.message.includes('KYBER') || error.message.includes('Nuclear Key Reset')) {
            errorMessage = 'Encryption failed due to incompatible key format. All participants must use the Nuclear Key Reset option in Settings.';
          } else if (error.message.includes('invalid encapsulation key')) {
            errorMessage = 'Encryption failed due to key compatibility issues. Both participants need to reset their encryption keys.';
          } else if (error.message.includes('Failed to encrypt message for any participants')) {
            errorMessage = 'Failed to encrypt message for any participants. Try using the Nuclear Key Reset option in Settings.';
          } else if (error.message.includes('Users with incompatible keys detected')) {
            errorMessage = error.message;
          }
        }
        return { success: false, error: errorMessage };
      }
    },

    async startTyping(conversationId) {
      try { await apiPost('/api/typing/start', { conversationId }); } catch {}
    },

    async stopTyping(conversationId) {
      try { await apiPost('/api/typing/stop', { conversationId }); } catch {}
    },

    setTyping(conversationId) {
      if (typingTimeout) clearTimeout(typingTimeout);
      get().startTyping(conversationId);
      typingTimeout = setTimeout(() => get().stopTyping(conversationId), 3000);
    },

    async createConversation(conversationData) {
      try {
        const response = await apiPost('/api/conversations/create', conversationData);
        if (response.success) {
          await publicKeyService.initializeUserEncryption();
          await get().loadConversations();
          return { success: true, data: response.conversation };
        }
      } catch {
        return { success: false, error: 'Failed to create conversation' };
      }
    },

    archiveConversation: (id) => conversationUtils.archiveConversation(apiPost, () => get().loadConversations(), id),
    unarchiveConversation: (id) => conversationUtils.unarchiveConversation(apiPost, () => get().loadConversations(), id),
    deleteConversation: (id) => conversationUtils.deleteConversation(apiPost, () => get().loadConversations(), id),

    setError: (error) => set({ error }),
    clearError: () => set({ error: null }),
    getWebSocket: () => null,
  };
});

// Legacy singleton compat
export const chat = {
  connect: (...args) => useChatStore.getState().connect(...args),
  disconnect: () => useChatStore.getState().disconnect(),
  loadConversations: () => useChatStore.getState().loadConversations(),
  joinConversation: (...args) => useChatStore.getState().joinConversation(...args),
  loadMessages: (...args) => useChatStore.getState().loadMessages(...args),
  sendMessage: (...args) => useChatStore.getState().sendMessage(...args),
  startTyping: (...args) => useChatStore.getState().startTyping(...args),
  stopTyping: (...args) => useChatStore.getState().stopTyping(...args),
  setTyping: (...args) => useChatStore.getState().setTyping(...args),
  createConversation: (...args) => useChatStore.getState().createConversation(...args),
  archiveConversation: (...args) => useChatStore.getState().archiveConversation(...args),
  unarchiveConversation: (...args) => useChatStore.getState().unarchiveConversation(...args),
  deleteConversation: (...args) => useChatStore.getState().deleteConversation(...args),
  getWebSocket: () => null,
};

// Update app badge on unread count changes
if (typeof window !== 'undefined') {
  useChatStore.subscribe((state) => {
    const count = state.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    updateAppBadge(count);
  });

  window.addEventListener('beforeunload', () => {
    useChatStore.getState().disconnect();
  });
}
