import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient
}));

vi.mock('@/lib/auth/coinpay.js', () => ({
  getAppOrigin: (origin) => origin
}));

vi.mock('@/lib/invites/mint.js', () => ({
  mintInviteToken: () => ({
    token: 'qci1.test-token',
    payload: { jti: 'invite-jti', exp: 1893456000 }
  })
}));

function inviteRequest(authorization) {
  return new Request('https://qrypt.chat/api/auth/invite-anon', {
    method: 'GET',
    headers: authorization ? { authorization } : {}
  });
}

function createSingleQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(result)
  };
  return query;
}

function createCountQuery(result) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn().mockResolvedValue(result)
  };
  return query;
}

describe('GET /api/auth/invite-anon authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: mocks.authGetUser
      }
    });
    mocks.createClient.mockReturnValue({
      from: mocks.from
    });
    mocks.from.mockImplementation((table) => {
      if (table === 'invite_issuers') {
        return createSingleQuery({
          data: { default_quota: 5, disabled: false },
          error: null
        });
      }

      if (table === 'issued_invites') {
        return createCountQuery({
          count: 1,
          error: null
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it('normalizes bearer scheme casing and extra spaces before validating the token', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(inviteRequest('bearer   access-token-123  '));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ remaining: null, quota: null, used: 1 });
    expect(mocks.authGetUser).toHaveBeenCalledWith('access-token-123');
  });

  it('rejects empty bearer headers before Supabase token validation', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(inviteRequest('Bearer   '));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Missing authorization header' });
    expect(mocks.authGetUser).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('fails closed when issued invite usage cannot be counted', async () => {
    mocks.from.mockImplementation((table) => {
      if (table === 'invite_issuers') {
        return createSingleQuery({
          data: { default_quota: 5, disabled: false },
          error: null
        });
      }

      if (table === 'issued_invites') {
        return createCountQuery({
          count: null,
          error: { message: 'count failed' }
        });
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('./route.js');

    const response = await GET(inviteRequest('Bearer access-token-123'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Failed to verify invite quota' });
  });
});

describe('POST /api/auth/invite-anon', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.QRYPT_WEB_ISSUER_SEED = 'test-seed';

    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.authGetUser }
    });
    mocks.createClient.mockReturnValue({ from: mocks.from });
  });

  function postRequest() {
    return new Request('https://qrypt.chat/api/auth/invite-anon', {
      method: 'POST',
      headers: { authorization: 'Bearer access-token-123' }
    });
  }

  function mockTables({ disabled = false } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table) => {
      if (table === 'users') return createSingleQuery({ data: { id: 'user-id' }, error: null });
      if (table === 'invite_issuers') {
        return createSingleQuery({ data: { default_quota: 5, disabled }, error: null });
      }
      if (table === 'issued_invites') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    });
    return insert;
  }

  it('mints an invite with no per-account limit', async () => {
    const insert = mockTables();
    const { POST } = await import('./route.js');

    const response = await POST(postRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, remaining: null });
    expect(body.url).toBe('https://qrypt.chat/anon?invite=qci1.test-token');
    expect(insert).toHaveBeenCalledOnce();
  });

  it('still refuses when the issuer is disabled', async () => {
    const insert = mockTables({ disabled: true });
    const { POST } = await import('./route.js');

    const response = await POST(postRequest());

    expect(response.status).toBe(503);
    expect(insert).not.toHaveBeenCalled();
  });
});
