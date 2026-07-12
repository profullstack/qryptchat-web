import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieClient: {
    auth: {
      getUser: vi.fn()
    }
  },
  tokenClient: {
    auth: {
      getUser: vi.fn()
    }
  },
  createSupabaseServerClient: vi.fn(),
  createSupabaseServerClientWithToken: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseServerClientWithToken: mocks.createSupabaseServerClientWithToken
}));

function requestWithAuthorization(value) {
  return {
    headers: {
      get: (name) => (name === 'authorization' ? value : null)
    }
  };
}

describe('authenticateRequest bearer token parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'missing cookie session' }
    });
    mocks.tokenClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null
    });
    mocks.createSupabaseServerClient.mockResolvedValue(mocks.cookieClient);
    mocks.createSupabaseServerClientWithToken.mockResolvedValue(mocks.tokenClient);
  });

  it('accepts bearer tokens with case-insensitive schemes and extra spaces', async () => {
    const { authenticateRequest } = await import('./auth.js');

    const auth = await authenticateRequest(requestWithAuthorization('bearer   access-token-123  '));

    expect(auth.success).toBe(true);
    expect(auth.user).toEqual({ id: 'user-1' });
    expect(mocks.createSupabaseServerClientWithToken).toHaveBeenCalledWith('access-token-123');
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('falls back to cookies when the authorization header has no token', async () => {
    const { authenticateRequest } = await import('./auth.js');

    const auth = await authenticateRequest(requestWithAuthorization('Bearer   '));

    expect(auth.success).toBe(false);
    expect(auth.error).toBe('Unauthorized');
    expect(mocks.createSupabaseServerClientWithToken).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).toHaveBeenCalledTimes(1);
  });
});
