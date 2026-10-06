import { describe, it, expect, vi, beforeEach } from 'vitest';

const sw = vi.hoisted(() => ({
	generateRegistrationOptions: vi.fn(async (o) => ({ challenge: 'reg-chal', rp: { id: o.rpID }, user: { name: o.userName }, excludeCredentials: o.excludeCredentials })),
	verifyRegistrationResponse: vi.fn(),
	generateAuthenticationOptions: vi.fn(async (o) => ({ challenge: 'login-chal', rpId: o.rpID })),
	verifyAuthenticationResponse: vi.fn(),
}));
vi.mock('@simplewebauthn/server', () => sw);

const {
	relyingParty, registrationOptions, registrationVerify, authenticationOptions, authenticationVerify, PasskeyError,
} = await import('../../src/lib/auth/passkey.js');
const { coinpayEmail, findAuthUserByCoinpaySub, sessionMessage } = await import('../../src/lib/auth/coinpay-identity.js');

/** In-memory tables behind the Supabase query-builder calls the passkey code makes. */
function fakeService(seed = {}) {
	const tables = { users: [], webauthn_credentials: [], webauthn_challenges: [], ...seed };
	const service = {
		tables,
		from(name) {
			const rows = (tables[name] ||= []);
			const q = { filters: [], isNull: null, patch: null, del: false };
			const match = (r) => q.filters.every(([op, c, v]) => (op === 'eq' ? r[c] === v : String(r[c]).toLowerCase() === String(v).toLowerCase())) && (!q.isNull || r[q.isNull] == null);
			const b = {
				select: () => b,
				order: () => b,
				eq: (c, v) => (q.filters.push(['eq', c, v]), b),
				ilike: (c, v) => (q.filters.push(['ilike', c, v]), b),
				is: (c) => ((q.isNull = c), b),
				update: (patch) => ((q.patch = patch), b),
				delete: () => ((q.del = true), b),
				insert: async (row) => {
					if (name === 'webauthn_credentials' && rows.some((r) => r.credential_id === row.credential_id)) return { error: { code: '23505' } };
					rows.push({ id: `${name}-${rows.length + 1}`, consumed_at: null, ...row });
					return { error: null };
				},
				maybeSingle: async () => ({ data: rows.find(match) ?? null }),
				then: (resolve) => {
					const hit = rows.filter(match);
					if (q.patch) hit.forEach((r) => Object.assign(r, q.patch));
					if (q.del) tables[name] = rows.filter((r) => !hit.includes(r));
					return resolve({ data: hit.map((r) => ({ ...r })), error: null });
				},
			};
			return b;
		},
	};
	return service;
}

const rp = { origin: 'https://qrypt.chat', rpID: 'qrypt.chat' };
const req = (origin) => new Request('https://qrypt.chat/api/auth/passkey/login-options', { method: 'POST', headers: origin ? { origin } : {} });

beforeEach(() => {
	sw.verifyRegistrationResponse.mockReset();
	sw.verifyAuthenticationResponse.mockReset();
});

describe('relying party', () => {
	it('is the host the browser is on, for our hosts only', () => {
		expect(relyingParty(req('https://qrypt.chat'), { NODE_ENV: 'production' })).toEqual(rp);
		expect(relyingParty(req('http://abcdefghijklmnop.onion'), { NODE_ENV: 'production' }).rpID).toBe('abcdefghijklmnop.onion');
		expect(() => relyingParty(req('https://evil.test'), { NODE_ENV: 'production' })).toThrow(PasskeyError);
		expect(() => relyingParty(req('http://qrypt.chat'), { NODE_ENV: 'production' })).toThrow(PasskeyError);
		expect(() => relyingParty(req(null), {})).toThrow(/Origin/);
		expect(relyingParty(req('http://localhost:3000'), { NODE_ENV: 'development' }).rpID).toBe('localhost');
		expect(() => relyingParty(req('http://localhost:3000'), { NODE_ENV: 'production' })).toThrow();
	});
});

describe('passkey sign-up', () => {
	it('validates the username and refuses a taken one, case-insensitively', async () => {
		const service = fakeService({ users: [{ username: 'Alice', auth_user_id: 'a' }] });
		await expect(registrationOptions(service, { rp, username: 'no spaces' })).rejects.toThrow(/3-30 letters/);
		await expect(registrationOptions(service, { rp, username: 'alice' })).rejects.toMatchObject({ status: 409 });
	});

	it('creates the account only after the passkey verifies, and the challenge works once', async () => {
		const service = fakeService();
		const { challengeId, options } = await registrationOptions(service, { rp, username: 'bob', displayName: 'Bob' });
		expect(options.user.name).toBe('bob');
		sw.verifyRegistrationResponse.mockResolvedValue({
			verified: true,
			registrationInfo: { credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] }, credentialDeviceType: 'multiDevice', credentialBackedUp: true },
		});
		const provision = vi.fn(async ({ username, displayName }) => {
			service.tables.users.push({ username, display_name: displayName, auth_user_id: 'new-user' });
			return 'new-user';
		});
		const result = await registrationVerify(service, { challengeId, response: { id: 'cred-1' }, provision });
		expect(result).toEqual({ authUserId: 'new-user', created: true });
		expect(provision).toHaveBeenCalledWith({ username: 'bob', displayName: 'Bob' });
		expect(sw.verifyRegistrationResponse.mock.calls[0][0]).toMatchObject({ expectedChallenge: 'reg-chal', expectedOrigin: 'https://qrypt.chat', expectedRPID: 'qrypt.chat' });
		expect(service.tables.webauthn_credentials[0]).toMatchObject({ auth_user_id: 'new-user', credential_id: 'cred-1', public_key: 'AQID', backed_up: true });

		await expect(registrationVerify(service, { challengeId, response: {}, provision })).rejects.toThrow(/expired|already used/);
	});

	it('makes no account when the passkey does not verify', async () => {
		const service = fakeService();
		const { challengeId } = await registrationOptions(service, { rp, username: 'carol' });
		sw.verifyRegistrationResponse.mockRejectedValue(new Error('bad attestation'));
		const provision = vi.fn();
		await expect(registrationVerify(service, { challengeId, response: {}, provision })).rejects.toThrow(/could not be verified/);
		expect(provision).not.toHaveBeenCalled();
	});
});

describe('adding a passkey to a signed-in account', () => {
	it('binds it to the account from the challenge and excludes ones it already has', async () => {
		const uid = '11111111-2222-3333-4444-555555555555';
		const service = fakeService({
			users: [{ username: 'dan', display_name: 'Dan', auth_user_id: uid }],
			webauthn_credentials: [{ id: 'c0', auth_user_id: uid, credential_id: 'old', transports: [] }],
		});
		const { challengeId, options } = await registrationOptions(service, { rp, authUserId: uid });
		expect(options.excludeCredentials).toEqual([{ id: 'old', transports: [] }]);
		sw.verifyRegistrationResponse.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: 'new', publicKey: new Uint8Array([9]), counter: 0 } } });
		const provision = vi.fn();
		expect(await registrationVerify(service, { challengeId, response: {}, provision, name: 'Laptop' })).toEqual({ authUserId: uid, created: false });
		expect(provision).not.toHaveBeenCalled();
		expect(service.tables.webauthn_credentials.at(-1)).toMatchObject({ auth_user_id: uid, credential_id: 'new', name: 'Laptop' });
	});
});

describe('passkey sign-in', () => {
	it('verifies against the stored key, bumps the counter, and returns the owner', async () => {
		const service = fakeService({ webauthn_credentials: [{ id: 'c1', auth_user_id: 'u1', credential_id: 'cred-1', public_key: 'AQID', counter: 4, transports: ['internal'] }] });
		const { challengeId } = await authenticationOptions(service, { rp });
		sw.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5 } });
		expect(await authenticationVerify(service, { challengeId, response: { id: 'cred-1' } })).toBe('u1');
		const call = sw.verifyAuthenticationResponse.mock.calls[0][0];
		expect(call.credential).toMatchObject({ id: 'cred-1', counter: 4 });
		expect(Array.from(call.credential.publicKey)).toEqual([1, 2, 3]);
		expect(service.tables.webauthn_credentials[0].counter).toBe(5);
	});

	it('refuses an unknown passkey and a failed signature', async () => {
		const service = fakeService({ webauthn_credentials: [{ id: 'c1', auth_user_id: 'u1', credential_id: 'cred-1', public_key: 'AQID', counter: 0, transports: [] }] });
		let { challengeId } = await authenticationOptions(service, { rp });
		await expect(authenticationVerify(service, { challengeId, response: { id: 'nope' } })).rejects.toMatchObject({ status: 404 });
		({ challengeId } = await authenticationOptions(service, { rp }));
		sw.verifyAuthenticationResponse.mockResolvedValue({ verified: false });
		await expect(authenticationVerify(service, { challengeId, response: { id: 'cred-1' } })).rejects.toMatchObject({ status: 401 });
	});
});

describe('CoinPay identity', () => {
	it('addresses an account by sub, never by the (unverified) email', () => {
		expect(coinpayEmail('5f0c1a2b-AB')).toBe('5f0c1a2b-ab@coinpay.qrypt.chat');
		expect(coinpayEmail('a b/c')).toBe('a-b-c@coinpay.qrypt.chat');
	});

	it('finds the account by coinpay_sub metadata, ignoring a matching email', async () => {
		const users = [
			{ id: 'victim', email: 'anthony@example.com', user_metadata: {} },
			{ id: 'cp', email: 'cp@coinpay.qrypt.chat', user_metadata: { coinpay_sub: 'sub-1' } },
		];
		const service = { auth: { admin: { listUsers: async () => ({ data: { users } }) } } };
		expect((await findAuthUserByCoinpaySub(service, 'sub-1')).id).toBe('cp');
		expect(await findAuthUserByCoinpaySub(service, 'sub-2')).toBeNull();
	});

	it('carries expires_at, which the auth store requires', () => {
		const m = sessionMessage({ access_token: 'a', refresh_token: 'r', expires_at: 9, expires_in: 1, token_type: 'bearer' }, { id: 'u' });
		expect(m).toMatchObject({ type: 'coinpay-session', expires_at: 9, user: { id: 'u' } });
	});
});
