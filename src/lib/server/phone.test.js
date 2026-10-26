import crypto from 'node:crypto';
import { signWebhook } from '@profullstack/coinpay-onboard';
import { describe, expect, it, vi } from 'vitest';
import { handleEvent, hangupCall, settleCall, settlePending, startCall } from './phone.js';
import { createTopup, handleCoinpayWebhook } from './phone-credit.js';
import { decodeState, encodeState, verifyWebhook } from './telnyx-voice.js';

function memoryStore({ balance = 0 } = {}) {
	const lines = new Map();
	const calls = new Map();
	const topups = new Map();
	const balances = new Map([['u1', balance]]);
	let n = 0;
	const add = (u, d) => {
		balances.set(u, (balances.get(u) || 0) + d);
		return balances.get(u);
	};
	return {
		calls,
		topups,
		balances,
		getLine: async (u) => lines.get(u) || null,
		saveLine: async (l) => lines.set(l.user_id, l),
		freeUsedSince: async (u, iso) => [...calls.values()].filter((c) => c.user_id === u && c.created_at >= iso).reduce((s, c) => s + (c.free_seconds || 0), 0),
		balance: async (u) => balances.get(u) || 0,
		liveCall: async (u) => [...calls.values()].find((c) => c.user_id === u && ['ringing', 'connecting', 'active'].includes(c.status)) || null,
		insertCall: async (row) => {
			const c = { id: `call-${++n}`, created_at: new Date().toISOString(), billed_seconds: 0, free_seconds: 0, charged_micros: 0, reconciled_at: null, ...row };
			calls.set(c.id, c);
			return c;
		},
		updateCall: async (id, patch) => Object.assign(calls.get(id), patch),
		findCall: async ({ id, sessionId }) => (id ? calls.get(id) : [...calls.values()].find((c) => c.session_id === sessionId)) || null,
		chargeCall: async (id, micros, carrier) => {
			const c = calls.get(id);
			if (c.reconciled_at) return null;
			Object.assign(c, { charged_micros: micros, carrier_cost_micros: carrier, reconciled_at: new Date().toISOString() });
			return add(c.user_id, -micros);
		},
		unsettled: async (u) => [...calls.values()].filter((c) => c.user_id === u && c.status === 'ended' && !c.reconciled_at),
		insertTopup: async (row) => {
			const t = { id: `top-${++n}`, status: 'pending', ...row };
			topups.set(t.id, t);
			return t;
		},
		setTopupSession: async (id, s) => (topups.get(id).session_id = s),
		creditTopup: async (id) => {
			const t = topups.get(id);
			if (!t || t.status !== 'pending') return null;
			t.status = 'paid';
			return add(t.user_id, t.amount_cents * 10_000);
		},
		topupIdBySession: async (s) => [...topups.values()].find((t) => t.session_id === s)?.id || null,
	};
}

const config = { appId: 'app', connectionId: 'conn', callerId: '+19492847328' };
const fakeTelnyx = () => ({
	createCredential: vi.fn(async () => ({ id: 'cred-1', sip_username: 'gencredABC' })),
	loginToken: vi.fn(async () => 'jwt'),
	dial: vi.fn(async () => ({ call_control_id: 'user-leg', call_session_id: 'sess-1' })),
	transfer: vi.fn(async () => ({})),
	hangup: vi.fn(async () => ({})),
	callRecords: vi.fn(async () => []),
});
const user = { id: 'u1', account_type: 'verified' };

/** Replays what Telnyx sent for a real call: browser answers, transfer, phone answers, hang-up. */
async function connectAndHangUp({ store, telnyx, callId, to, answered = '2026-10-26T12:39:57.481Z', ended = '2026-10-26T12:40:30.041Z' }) {
	const ev = (event_type, payload) => handleEvent({ store, telnyx, config, event: { event_type, occurred_at: ended, payload } });
	const cs = encodeState({ c: callId });
	await ev('call.answered', { call_control_id: 'user-leg', call_session_id: 'sess-1', to: 'sip:gencredABC@sip.telnyx.com', client_state: cs });
	await ev('call.answered', { call_control_id: 'other-leg', call_session_id: 'sess-1', to: 'gencredABC' });
	await ev('call.answered', { call_control_id: 'pstn-leg', call_session_id: 'sess-1', to, start_time: answered });
	return ev('call.hangup', { call_control_id: 'pstn-leg', call_session_id: 'sess-1', to, start_time: answered, end_time: ended, hangup_cause: 'normal_clearing' });
}

describe('phone calls', () => {
	it('places a free US call, transfers on answer, and bills nothing within the free minutes', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '(303) 499-7111', env: {} });
		expect(r).toMatchObject({ to: '+13034997111', country: 'US', limitSeconds: 600, freeSeconds: 600 });
		const [dial] = telnyx.dial.mock.calls[0];
		expect(dial).toMatchObject({ connection_id: 'app', to: 'sip:gencredABC@sip.telnyx.com', from: '+19492847328' });
		expect(decodeState(dial.client_state)).toEqual({ c: r.callId });
		await connectAndHangUp({ store, telnyx, callId: r.callId, to: '+13034997111' });
		expect(telnyx.transfer).toHaveBeenCalledWith('user-leg', expect.objectContaining({ to: '+13034997111', time_limit_secs: 600 }));
		expect(store.calls.get(r.callId)).toMatchObject({ status: 'ended', billed_seconds: 33, free_seconds: 33, charged_micros: 0 });
		expect((await startCall({ store, telnyx, config, user, to: '4085551234', env: {} })).limitSeconds).toBe(567);
	});

	it('charges US minutes past the free ones at 1 cent each, from credit', async () => {
		const store = memoryStore({ balance: 1_000_000 });
		await store.insertCall({ user_id: 'u1', status: 'ended', free_seconds: 590, reconciled_at: 'x' });
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '4085551234', env: {} });
		expect(r).toMatchObject({ freeSeconds: 10, limitSeconds: 3600 });
		await connectAndHangUp({ store, telnyx, callId: r.callId, to: '+14085551234', answered: '2026-10-26T12:00:00Z', ended: '2026-10-26T12:01:41Z' });
		// 101 s billed, 10 free, 91 paid = 2 started minutes = 2 cents.
		expect(store.calls.get(r.callId)).toMatchObject({ billed_seconds: 101, free_seconds: 10, charged_micros: 20_000 });
		expect(store.balances.get('u1')).toBe(980_000);
	});

	it('bills calls abroad at twice the carrier cost once Telnyx has the records', async () => {
		const store = memoryStore({ balance: 5_000_000 });
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '+44 20 7946 0958', env: {} });
		expect(r).toMatchObject({ country: 'GB', freeSeconds: 0, limitSeconds: 1440 });
		const result = await connectAndHangUp({ store, telnyx, callId: r.callId, to: '+442079460958' });
		expect(result.pending).toBe(true);
		expect(store.calls.get(r.callId).reconciled_at).toBeNull();
		telnyx.callRecords.mockResolvedValueOnce([{ cost: '0.0064' }, { cost: '8.0E-4' }]);
		await settlePending({ store, telnyx, userId: 'u1', now: Date.now() + 120_000 });
		expect(store.calls.get(r.callId)).toMatchObject({ charged_micros: 14_400, carrier_cost_micros: 7_200 });
		expect(store.balances.get('u1')).toBe(4_985_600);
		expect(await settleCall({ store, telnyx, call: store.calls.get(r.callId) })).toEqual({ settled: 'already' });
	});

	it('refuses blocked numbers, closed countries, calls without allowance and a second live call', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		await expect(startCall({ store, telnyx, config, user, to: '911', env: {} })).rejects.toMatchObject({ status: 400 });
		await expect(startCall({ store, telnyx, config, user, to: '+1 876 555 1234', env: {} })).rejects.toThrow(/Jamaica/);
		await expect(startCall({ store, telnyx, config, user, to: '+44 20 7946 0958', env: {} })).rejects.toThrow(/use credit/);
		await expect(startCall({ store, telnyx, config, user: { id: 'a', account_type: 'anonymous' }, to: '4085551234', env: {} })).rejects.toMatchObject({ status: 402 });
		await startCall({ store, telnyx, config, user, to: '4085551234', env: {} });
		await expect(startCall({ store, telnyx, config, user, to: '4085551234', env: {} })).rejects.toMatchObject({ status: 409 });
	});

	it('lets operators call anywhere for an hour, uncharged, and ends calls that never connected', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '+44 20 7946 0958', env: { PHONE_OPERATOR_IDS: 'x, u1' } });
		expect(r.limitSeconds).toBe(3600);
		await handleEvent({ store, telnyx, config, event: { event_type: 'call.hangup', payload: { call_control_id: 'user-leg', call_session_id: 'sess-1', hangup_cause: 'timeout' } } });
		expect(store.calls.get(r.callId)).toMatchObject({ status: 'ended', billed_seconds: 0, charged_micros: 0, hangup_cause: 'timeout' });
		await hangupCall({ store, telnyx, user, callId: r.callId });
		expect(telnyx.hangup).toHaveBeenCalledWith('user-leg');
		await expect(hangupCall({ store, telnyx, user: { id: 'other' }, callId: r.callId })).rejects.toMatchObject({ status: 404 });
	});

	it('marks the call failed if Telnyx refuses to dial', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		telnyx.dial.mockRejectedValueOnce(new Error('channel limit'));
		await expect(startCall({ store, telnyx, config, user, to: '4085551234', env: {} })).rejects.toMatchObject({ status: 502 });
		expect([...store.calls.values()][0].status).toBe('failed');
	});
});

describe('phone credit', () => {
	const secret = 'whsec_test';
	const coinpay = { createCheckoutSession: vi.fn(async () => ({ id: 'cs_1', url: 'https://coinpayportal.com/checkout/cs_1' })) };

	it('starts a CoinPay checkout and credits the paid top-up exactly once', async () => {
		const store = memoryStore();
		const r = await createTopup({ store, coinpay, user, email: '', dollars: 10 });
		expect(r.url).toMatch(/cs_1/);
		expect(coinpay.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, accountId: 'u1', customerEmail: 'u1@phone.qrypt.chat', metadata: { kind: 'phone_credit', topup: r.topupId } }));
		const body = JSON.stringify({ id: 'evt_1', type: 'payment.confirmed', data: { status: 'confirmed', checkout_session_id: 'cs_1', metadata: { kind: 'phone_credit', topup: r.topupId } } });
		const signature = signWebhook(body, secret);
		expect(await handleCoinpayWebhook({ store, rawBody: body, signature, secret })).toEqual({ credited: true, balance: 10_000_000 });
		expect(await handleCoinpayWebhook({ store, rawBody: body, signature, secret })).toEqual({ ignored: 'already credited' });
		await expect(handleCoinpayWebhook({ store, rawBody: body, signature: 't=1,v1=00', secret })).rejects.toMatchObject({ status: 401 });
		await expect(createTopup({ store, coinpay, user, dollars: 7 })).rejects.toMatchObject({ status: 400 });
	});

	it('finds the top-up by checkout session when the payment carries no metadata', async () => {
		const store = memoryStore();
		const r = await createTopup({ store, coinpay, user, email: 'a@b.c', dollars: 5 });
		const body = JSON.stringify({ id: 'evt_2', type: 'payment.confirmed', data: { status: 'confirmed', checkout_session_id: 'cs_1' } });
		expect(await handleCoinpayWebhook({ store, rawBody: body, signature: signWebhook(body, secret), secret })).toMatchObject({ credited: true });
		expect(store.topups.get(r.topupId).status).toBe('paid');
	});
});

describe('Telnyx webhook signatures', () => {
	const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
	const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64');
	const pem = publicKey.export({ format: 'pem', type: 'spki' });
	const body = '{"data":{"event_type":"call.hangup"}}';
	const now = Date.now();
	const timestamp = String(Math.floor(now / 1000));
	const signature = crypto.sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString('base64');

	it('accepts the bare 32-byte key and PEM, and rejects tampering and replays', () => {
		expect(verifyWebhook({ body, signature, timestamp, publicKey: raw, now })).toBe(true);
		expect(verifyWebhook({ body, signature, timestamp, publicKey: pem, now })).toBe(true);
		expect(verifyWebhook({ body: body.replace('hangup', 'answered'), signature, timestamp, publicKey: raw, now })).toBe(false);
		expect(verifyWebhook({ body, signature, timestamp, publicKey: raw, now: now + 600_000 })).toBe(false);
		expect(verifyWebhook({ body, signature: '', timestamp, publicKey: raw, now })).toBe(false);
	});
});
