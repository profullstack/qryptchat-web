/**
 * Sign in with CoinPay: the sealed pending cookie, connect decisions and the
 * disconnect guard (src/lib/auth/coinpay-flow.js), plus the sub-only binding.
 */
import { describe, it, expect } from 'vitest';
import { checkIdToken, sameState } from '@profullstack/coinpay-onboard/oauth';
import { sealPending, unsealPending, decideConnect, canDisconnect } from '../src/lib/auth/coinpay-flow.js';
import { isCoinpayEmail, coinpayEmail, findAuthUserByCoinpaySub } from '../src/lib/auth/coinpay-identity.js';

const KEY = 'client-secret-for-tests';
const base = { state: 's1', verifier: 'v1', nonce: 'n1' };

describe('pending cookie', () => {
	it('round-trips a login and a connect', () => {
		expect(unsealPending(sealPending({ ...base, mode: 'login', popup: true }, KEY), KEY)).toMatchObject({ ...base, mode: 'login', popup: true, userId: null });
		expect(unsealPending(sealPending({ ...base, mode: 'connect', userId: 'u1' }, KEY), KEY)).toMatchObject({ mode: 'connect', userId: 'u1' });
	});
	it('refuses forged, re-keyed, edited and expired cookies', () => {
		const sealed = sealPending({ ...base, mode: 'connect', userId: 'u1' }, KEY);
		expect(unsealPending(sealed, 'another-key')).toBeNull();
		const [, sig] = sealed.split('.');
		const edited = Buffer.from(JSON.stringify({ ...base, mode: 'connect', userId: 'victim', exp: 9e9 })).toString('base64url');
		expect(unsealPending(`${edited}.${sig}`, KEY)).toBeNull();
		const unsigned = Buffer.from(JSON.stringify({ ...base, mode: 'login', exp: 9e9 })).toString('base64url');
		expect(unsealPending(unsigned, KEY)).toBeNull();
		expect(unsealPending(sealPending({ ...base, mode: 'login' }, KEY, 1000), KEY, 5000)).toBeNull();
		expect(unsealPending(sealPending({ ...base, mode: 'connect' }, KEY), KEY)).toBeNull(); // connect needs a user
	});
	it('bad state and nonce are rejected', () => {
		expect(sameState('abc', 'abd')).toBe(false);
		expect(sameState('abc', null)).toBe(false);
		const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
		const claims = { iss: 'https://coinpayportal.com', sub: 'x', aud: 'cp_q', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'n1' };
		const tok = `${part({ alg: 'HS256' })}.${part(claims)}.sig`;
		expect(checkIdToken({ idToken: tok, clientId: 'cp_q', nonce: 'n1' }).sub).toBe('x');
		expect(() => checkIdToken({ idToken: tok, clientId: 'cp_q', nonce: 'n2' })).toThrow();
	});
});

describe('connect', () => {
	it('needs a signed-in account', () => {
		expect(decideConnect({ userId: null, sub: 's', boundTo: null, currentSub: null })).toEqual({ ok: false, code: 'coinpay_not_signed_in' });
	});
	it('refuses a sub bound to another account, or a second sub', () => {
		expect(decideConnect({ userId: 'me', sub: 's', boundTo: { id: 'other' }, currentSub: null }).code).toBe('coinpay_linked_elsewhere');
		expect(decideConnect({ userId: 'me', sub: 's', boundTo: null, currentSub: 't' }).code).toBe('coinpay_already_connected');
		expect(decideConnect({ userId: 'me', sub: 's', boundTo: null, currentSub: null })).toEqual({ ok: true });
		expect(decideConnect({ userId: 'me', sub: 's', boundTo: { id: 'me' }, currentSub: 's' })).toEqual({ ok: true, already: true });
	});
});

describe('disconnect guard', () => {
	it('refuses when CoinPay is the only way in', () => {
		const cp = { email: coinpayEmail('abc'), phone: '' };
		expect(isCoinpayEmail(cp.email)).toBe(true);
		expect(canDisconnect(cp, 0, isCoinpayEmail)).toBe(false);
		expect(canDisconnect(cp, 1, isCoinpayEmail)).toBe(true);
		expect(canDisconnect({ ...cp, phone: '14155550100' }, 0, isCoinpayEmail)).toBe(true);
	});
});

describe('binding is by sub in app_metadata only', () => {
	it('never matches on email or user-writable user_metadata', async () => {
		const users = [
			{ id: 'victim', email: 'victim@example.com', app_metadata: {}, user_metadata: {} },
			{ id: 'squatter', email: 'x@y.z', app_metadata: {}, user_metadata: { coinpay_sub: 'sub-1' } },
			{ id: 'real', email: coinpayEmail('sub-1'), app_metadata: { coinpay_sub: 'sub-1' }, user_metadata: {} },
		];
		const service = { auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } } };
		expect((await findAuthUserByCoinpaySub(service, 'sub-1'))?.id).toBe('real');
		expect(await findAuthUserByCoinpaySub(service, 'victim@example.com')).toBeNull();
	});
});
