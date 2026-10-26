import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { handleEvent, hangupCall, startCall } from './phone.js';
import { decodeState, encodeState, verifyWebhook } from './telnyx-voice.js';

function memoryStore() {
	const lines = new Map();
	const calls = new Map();
	let n = 0;
	return {
		calls,
		getLine: async (u) => lines.get(u) || null,
		saveLine: async (l) => lines.set(l.user_id, l),
		usedSince: async (u, iso) => [...calls.values()].filter((c) => c.user_id === u && c.created_at >= iso).reduce((s, c) => s + (c.billed_seconds || 0), 0),
		liveCall: async (u) => [...calls.values()].find((c) => c.user_id === u && ['ringing', 'connecting', 'active'].includes(c.status)) || null,
		insertCall: async (row) => {
			const c = { id: `call-${++n}`, created_at: new Date().toISOString(), billed_seconds: 0, ...row };
			calls.set(c.id, c);
			return c;
		},
		updateCall: async (id, patch) => Object.assign(calls.get(id), patch),
		findCall: async ({ id, sessionId }) => (id ? calls.get(id) : [...calls.values()].find((c) => c.session_id === sessionId)) || null,
	};
}

const config = { appId: 'app', connectionId: 'conn', callerId: '+19492847328' };
const fakeTelnyx = () => ({
	createCredential: vi.fn(async () => ({ id: 'cred-1', sip_username: 'gencredABC' })),
	loginToken: vi.fn(async () => 'jwt'),
	dial: vi.fn(async () => ({ call_control_id: 'user-leg', call_session_id: 'sess-1' })),
	transfer: vi.fn(async () => ({})),
	hangup: vi.fn(async () => ({})),
});
const user = { id: 'u1', account_type: 'verified' };

describe('phone calls', () => {
	it('places a call, transfers on answer, and bills from answer to hang-up (replaying a real Telnyx sequence)', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '(303) 499-7111', env: {} });
		expect(r).toMatchObject({ to: '+13034997111', limitSeconds: 600 });
		const [dial] = telnyx.dial.mock.calls[0];
		expect(dial).toMatchObject({ connection_id: 'app', to: 'sip:gencredABC@sip.telnyx.com', from: '+19492847328' });
		expect(decodeState(dial.client_state)).toEqual({ c: r.callId });

		const ev = (event_type, payload) => handleEvent({ store, telnyx, config, event: { event_type, occurred_at: '2026-10-26T12:40:30Z', payload } });
		const cs = encodeState({ c: r.callId });
		await ev('call.initiated', { call_control_id: 'user-leg', call_session_id: 'sess-1', to: 'sip:gencredABC@sip.telnyx.com', client_state: cs });
		await ev('call.answered', { call_control_id: 'user-leg', call_session_id: 'sess-1', to: 'sip:gencredABC@sip.telnyx.com', client_state: cs, start_time: '2026-10-26T12:39:55.641Z' });
		expect(telnyx.transfer).toHaveBeenCalledWith('user-leg', expect.objectContaining({ to: '+13034997111', time_limit_secs: 600 }));
		// The browser-side internal leg Telnyx also reports is ignored.
		await ev('call.answered', { call_control_id: 'other-leg', call_session_id: 'sess-1', to: 'gencredABC' });
		await ev('call.answered', { call_control_id: 'pstn-leg', call_session_id: 'sess-1', to: '+13034997111', start_time: '2026-10-26T12:39:57.481Z' });
		expect(store.calls.get(r.callId).status).toBe('active');
		await ev('call.hangup', { call_control_id: 'pstn-leg', call_session_id: 'sess-1', to: '+13034997111', start_time: '2026-10-26T12:39:57.481Z', end_time: '2026-10-26T12:40:30.041Z', hangup_cause: 'time_limit' });
		await ev('call.hangup', { call_control_id: 'user-leg', call_session_id: 'sess-1', to: 'sip:gencredABC@sip.telnyx.com', end_time: '2026-10-26T12:40:30.081Z' });
		expect(store.calls.get(r.callId)).toMatchObject({ status: 'ended', billed_seconds: 33, hangup_cause: 'time_limit' });

		// 33 s used: the next call may last 567 s.
		const r2 = await startCall({ store, telnyx, config, user, to: '4085551234', env: {} });
		expect(r2.limitSeconds).toBe(567);
	});

	it('refuses blocked numbers, anonymous accounts, a second live call and an empty allowance', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		await expect(startCall({ store, telnyx, config, user, to: '911', env: {} })).rejects.toMatchObject({ status: 400 });
		await expect(startCall({ store, telnyx, config, user, to: '+19005551234', env: {} })).rejects.toThrow(/Premium/);
		await expect(startCall({ store, telnyx, config, user: { id: 'a', account_type: 'anonymous' }, to: '4085551234', env: {} })).rejects.toMatchObject({ status: 402 });
		await startCall({ store, telnyx, config, user, to: '4085551234', env: {} });
		await expect(startCall({ store, telnyx, config, user, to: '4085551234', env: {} })).rejects.toMatchObject({ status: 409 });
		const spent = memoryStore();
		await spent.insertCall({ user_id: 'u1', status: 'ended', billed_seconds: 590 });
		await expect(startCall({ store: spent, telnyx, config, user, to: '4085551234', env: {} })).rejects.toThrow(/10 free minutes/);
	});

	it('lets operators call for an hour and marks a call that never connected as ended', async () => {
		const store = memoryStore();
		const telnyx = fakeTelnyx();
		const r = await startCall({ store, telnyx, config, user, to: '4085551234', env: { PHONE_OPERATOR_IDS: 'x, u1' } });
		expect(r.limitSeconds).toBe(3600);
		await handleEvent({ store, telnyx, config, event: { event_type: 'call.hangup', payload: { call_control_id: 'user-leg', call_session_id: 'sess-1', hangup_cause: 'timeout' } } });
		expect(store.calls.get(r.callId)).toMatchObject({ status: 'ended', billed_seconds: 0, hangup_cause: 'timeout' });
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
