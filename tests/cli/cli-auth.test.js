import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyOtp = vi.fn();
const refreshSession = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
	createClient: () => ({ auth: { verifyOtp, refreshSession } }),
}));

const { pkceChallenge, validRedirectUri, validVerifier, issueCode, redeemCode, hashCode, refresh, CliAuthError } = await import(
	'../../src/lib/auth/cli-auth.js'
);

/** Just enough of the Supabase query builder for cli_auth_codes and users. */
function fakeService({ email = 'a@b.c' } = {}) {
	const rows = new Map();
	const updates = [];
	const service = {
		rows,
		updates,
		auth: {
			admin: {
				getUserById: vi.fn(async (id) => ({ data: { user: { id, email } } })),
				updateUserById: vi.fn(async () => ({ error: null })),
				generateLink: vi.fn(async () => ({ data: { properties: { hashed_token: 'h' } } })),
			},
		},
		from(table) {
			const q = { table, filters: [], isNull: null };
			const builder = {
				insert: async (row) => {
					rows.set(row.code_hash, { ...row, consumed_at: null });
					return { error: null };
				},
				select: () => builder,
				update: (patch) => {
					q.patch = patch;
					return builder;
				},
				eq: (col, val) => {
					q.filters.push([col, val]);
					if (q.patch) return builder;
					return builder;
				},
				is: (col) => {
					q.isNull = col;
					if (q.patch) {
						const [, hash] = q.filters[0];
						const row = rows.get(hash);
						const won = row && row[col] === null;
						if (won) Object.assign(row, q.patch);
						updates.push(won);
						return { select: async () => ({ data: won ? [{ code_hash: hash }] : [] }) };
					}
					return builder;
				},
				maybeSingle: async () => {
					if (table === 'users') return { data: { id: 'internal-1', username: 'alice', display_name: 'Alice' } };
					const [, hash] = q.filters[0];
					return { data: rows.get(hash) ? { ...rows.get(hash) } : null };
				},
			};
			return builder;
		},
	};
	return service;
}

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // RFC 7636 appendix B
const REDIRECT = 'http://127.0.0.1:53682/callback';

beforeEach(() => {
	verifyOtp.mockResolvedValue({ data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 9, expires_in: 3600 } } });
});

describe('PKCE and redirects', () => {
	it('matches the RFC 7636 S256 example', () => {
		expect(pkceChallenge(VERIFIER)).toBe(CHALLENGE);
		expect(validVerifier(VERIFIER)).toBe(true);
		expect(validVerifier('short')).toBe(false);
	});

	it('accepts only loopback redirects or oob', () => {
		expect(validRedirectUri(REDIRECT)).toBe(true);
		expect(validRedirectUri('http://[::1]:9000/cb')).toBe(true);
		expect(validRedirectUri('oob')).toBe(true);
		for (const bad of ['https://evil.test/cb', 'http://localhost.evil.test:1/cb', 'http://127.0.0.1/cb', 'http://user@127.0.0.1:1/cb', 'javascript:alert(1)']) {
			expect(validRedirectUri(bad)).toBe(false);
		}
	});
});

describe('codes', () => {
	async function issued(service) {
		return issueCode(service, { authUserId: 'auth-1', codeChallenge: CHALLENGE, redirectUri: REDIRECT, clientName: 'qc on box', keyBlob: 'x'.repeat(64) });
	}

	it('stores only the hash, and redeems once with the right verifier', async () => {
		const service = fakeService();
		const code = await issued(service);
		expect(service.rows.has(code)).toBe(false);
		expect(service.rows.has(hashCode(code))).toBe(true);

		const token = await redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: REDIRECT });
		expect(token).toMatchObject({ access_token: 'at', refresh_token: 'rt', key_blob: 'x'.repeat(64), user: { username: 'alice' } });

		await expect(redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: REDIRECT })).rejects.toThrow(/unknown, used or expired/);
	});

	it('refuses a wrong verifier or redirect without burning the code', async () => {
		const service = fakeService();
		const code = await issued(service);
		await expect(redeemCode(service, { code, codeVerifier: 'A'.repeat(43), redirectUri: REDIRECT })).rejects.toThrow(/code_verifier/);
		await expect(redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: 'http://127.0.0.1:1/x' })).rejects.toThrow(/redirect_uri/);
		expect(service.updates).toEqual([]);
		await expect(redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: REDIRECT })).resolves.toBeTruthy();
	});

	it('refuses an expired code', async () => {
		const service = fakeService();
		const code = await issued(service);
		service.rows.get(hashCode(code)).expires_at = new Date(Date.now() - 1000).toISOString();
		await expect(redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: REDIRECT })).rejects.toBeInstanceOf(CliAuthError);
	});

	it('gives a phone-only account a synthetic address before minting', async () => {
		const service = fakeService({ email: null });
		const code = await issued(service);
		await redeemCode(service, { code, codeVerifier: VERIFIER, redirectUri: REDIRECT });
		expect(service.auth.admin.updateUserById).toHaveBeenCalledWith('auth-1', { email: 'auth-1@cli.qrypt.chat', email_confirm: true });
		expect(service.auth.admin.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'auth-1@cli.qrypt.chat' });
	});

	it('validates what the browser sends', async () => {
		const service = fakeService();
		await expect(issueCode(service, { authUserId: 'a', codeChallenge: 'x', redirectUri: REDIRECT, keyBlob: 'x'.repeat(64) })).rejects.toThrow(/S256/);
		await expect(issueCode(service, { authUserId: 'a', codeChallenge: CHALLENGE, redirectUri: 'https://evil.test/', keyBlob: 'x'.repeat(64) })).rejects.toThrow(/loopback/);
		await expect(issueCode(service, { authUserId: 'a', codeChallenge: CHALLENGE, redirectUri: REDIRECT, keyBlob: '' })).rejects.toThrow(/key_blob/);
	});
});

describe('refresh', () => {
	it('rotates through Supabase and reports a dead token as invalid_grant', async () => {
		refreshSession.mockResolvedValueOnce({ data: { session: { access_token: 'a2', refresh_token: 'r2', expires_at: 1, expires_in: 1 } } });
		expect(await refresh('r1')).toMatchObject({ access_token: 'a2', refresh_token: 'r2' });
		refreshSession.mockResolvedValueOnce({ data: {}, error: { message: 'Invalid Refresh Token' } });
		await expect(refresh('r1')).rejects.toMatchObject({ code: 'invalid_grant' });
	});
});
