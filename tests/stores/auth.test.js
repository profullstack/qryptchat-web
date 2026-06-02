import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../../src/lib/stores/auth.js';

vi.mock('../../src/lib/supabase.js', () => ({
  createSupabaseClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  }),
}));

vi.mock('../../src/lib/crypto/key-manager.js', () => ({
  keyManager: { generateUserKeys: vi.fn() },
}));

vi.mock('../../src/lib/crypto/key-sync-service.js', () => ({
  keySyncService: { autoSyncOnLogin: vi.fn().mockResolvedValue({ success: true }) },
}));

describe('Auth Store (Zustand)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: false });
    vi.clearAllMocks();
    window.localStorage.getItem.mockReturnValue(null);
  });

  it('starts with null user', () => {
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('sets loading false when no stored session', async () => {
    await useAuthStore.getState().init();
    expect(useAuthStore.getState().loading).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('sends SMS successfully', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    const result = await useAuthStore.getState().sendSMS('+15551234567');
    expect(result.success).toBe(true);
  });

  it('returns error when SMS send fails', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Too many requests' }) });
    const result = await useAuthStore.getState().sendSMS('+15551234567');
    expect(result.success).toBe(false);
  });

  it('logs out and clears user state', async () => {
    useAuthStore.setState({ user: { id: '123', username: 'test' } });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('updateUser merges updates into existing user', () => {
    useAuthStore.setState({ user: { id: '1', username: 'old', displayName: 'Old Name' } });
    useAuthStore.getState().updateUser({ displayName: 'New Name' });
    expect(useAuthStore.getState().user.displayName).toBe('New Name');
    expect(useAuthStore.getState().user.username).toBe('old');
  });
});
