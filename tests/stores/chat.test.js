import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '../../src/lib/stores/chat.js';

vi.mock('../../src/lib/crypto/multi-recipient-encryption.js', () => ({
  multiRecipientEncryption: { initialize: vi.fn(), encryptForConversation: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../src/lib/crypto/post-quantum-encryption.js', () => ({
  postQuantumEncryption: { decryptFromSender: vi.fn().mockResolvedValue('Decrypted message') },
}));

vi.mock('../../src/lib/crypto/public-key-service.js', () => ({
  publicKeyService: { initialize: vi.fn(), initializeUserEncryption: vi.fn() },
}));

vi.mock('../../src/lib/utils/badge.js', () => ({ updateAppBadge: vi.fn() }));
vi.mock('../../src/lib/api/protocol.js', () => ({
  MESSAGE_TYPES: { NEW_MESSAGE: 'NEW_MESSAGE', USER_TYPING: 'USER_TYPING', CONVERSATION_CREATED: 'CONVERSATION_CREATED' },
}));
vi.mock('../../src/lib/utils/conversation-utils.js', () => ({
  archiveConversation: vi.fn().mockResolvedValue({ success: true }),
  unarchiveConversation: vi.fn().mockResolvedValue({ success: true }),
  deleteConversation: vi.fn().mockResolvedValue({ success: true }),
}));

describe('Chat Store (Zustand)', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [], groups: [], activeConversation: null,
      messages: [], loading: false, error: null,
      typingUsers: [], connected: false, authenticated: false, user: null,
    });
    vi.clearAllMocks();
  });

  it('initializes with empty state', () => {
    const s = useChatStore.getState();
    expect(s.conversations).toEqual([]);
    expect(s.messages).toEqual([]);
    expect(s.connected).toBe(false);
    expect(s.authenticated).toBe(false);
  });

  it('loads conversations from API', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, conversations: [{ id: 'conv-1', type: 'direct', name: 'Test' }] }),
    });
    await useChatStore.getState().loadConversations();
    expect(useChatStore.getState().conversations).toHaveLength(1);
    expect(useChatStore.getState().conversations[0].id).toBe('conv-1');
  });

  it('handles conversation loading errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    await useChatStore.getState().loadConversations();
    expect(useChatStore.getState().error).toBe('Failed to load conversations');
  });

  it('loads messages for a conversation', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        messages: [{ id: 'msg-1', encrypted_content: 'enc', conversation_id: 'conv-1', sender_id: 'u1', created_at: new Date().toISOString() }],
      }),
    });
    await useChatStore.getState().loadMessages('conv-1');
    expect(useChatStore.getState().messages).toHaveLength(1);
    expect(useChatStore.getState().activeConversation).toBe('conv-1');
  });

  it('sets error on message loading failure', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    await useChatStore.getState().loadMessages('conv-1');
    expect(useChatStore.getState().error).toBe('Failed to load messages');
  });

  it('clears error state', () => {
    useChatStore.setState({ error: 'Some error' });
    useChatStore.getState().clearError();
    expect(useChatStore.getState().error).toBeNull();
  });

  it('tracks typing users', () => {
    useChatStore.setState({ typingUsers: [{ id: 'u1', username: 'alice', display_name: 'Alice' }] });
    expect(useChatStore.getState().typingUsers[0].username).toBe('alice');
  });
});
