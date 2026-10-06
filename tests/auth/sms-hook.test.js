import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomBytes } from 'node:crypto';
import { verifyHook, e164, sendViaTelnyx, smsText } from '../../src/lib/auth/sms-hook.js';

const key = randomBytes(32);
const SECRET = `v1,whsec_${key.toString('base64')}`;

function sign(body, { id = 'msg_1', ts = Math.floor(Date.now() / 1000), k = key } = {}) {
	const sig = createHmac('sha256', k).update(`${id}.${ts}.${body}`).digest('base64');
	return { id, timestamp: String(ts), signature: `v1,${sig}`, body };
}

describe('Standard Webhooks signature', () => {
	it('accepts a correctly signed, fresh request', () => {
		expect(verifyHook(sign('{"a":1}'), SECRET)).toBe(true);
	});

	it('accepts one good signature among several (key rotation)', () => {
		const good = sign('{}');
		expect(verifyHook({ ...good, signature: `v1,AAAA ${good.signature}` }, SECRET)).toBe(true);
	});

	it('rejects a tampered body, a wrong key, a stale timestamp and missing headers', () => {
		const good = sign('{"otp":"123456"}');
		expect(verifyHook({ ...good, body: '{"otp":"999999"}' }, SECRET)).toBe(false);
		expect(verifyHook(sign('{}', { k: randomBytes(32) }), SECRET)).toBe(false);
		expect(verifyHook(sign('{}', { ts: Math.floor(Date.now() / 1000) - 3600 }), SECRET)).toBe(false);
		expect(verifyHook({ ...good, signature: null }, SECRET)).toBe(false);
	});
});

describe('Telnyx delivery', () => {
	it('formats E.164 from GoTrue phones', () => {
		expect(e164('14086562473')).toBe('+14086562473');
		expect(e164('+1 (408) 656-2473')).toBe('+14086562473');
		expect(e164('123')).toBeNull();
	});

	it('posts the code from the configured number', async () => {
		const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'm1' } }), { status: 200 }));
		const id = await sendViaTelnyx({ to: '+15550001111', text: smsText('424242') }, { apiKey: 'k', from: '+14084269127', fetchImpl });
		expect(id).toBe('m1');
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://api.telnyx.com/v2/messages');
		expect(init.headers.Authorization).toBe('Bearer k');
		expect(JSON.parse(init.body)).toEqual({ to: '+15550001111', from: '+14084269127', text: smsText('424242') });
	});

	it("surfaces Telnyx's error detail", async () => {
		const fetchImpl = async () => new Response(JSON.stringify({ errors: [{ detail: 'Invalid destination' }] }), { status: 422 });
		await expect(sendViaTelnyx({ to: '+1', text: 'x' }, { apiKey: 'k', from: '+1', fetchImpl })).rejects.toThrow('Telnyx: Invalid destination');
	});
});

describe('POST /api/auth/hooks/send-sms', () => {
	const env = { ...process.env };
	beforeEach(() => {
		process.env.SEND_SMS_HOOK_SECRET = SECRET;
		process.env.TELNYX_API_KEY = 'k';
		process.env.TELNYX_SMS_FROM = '+14084269127';
	});
	afterEach(() => {
		process.env = { ...env };
		vi.unstubAllGlobals();
	});

	async function call(body, headers) {
		const { POST } = await import('../../src/app/api/auth/hooks/send-sms/route.js');
		return POST(new Request('http://x/api/auth/hooks/send-sms', { method: 'POST', body, headers }));
	}

	it('refuses an unsigned request without sending anything', async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);
		const res = await call('{"user":{"phone":"15550001111"},"sms":{"otp":"1"}}', {});
		expect(res.status).toBe(401);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('sends the code for a signed request', async () => {
		const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'm' } }), { status: 200 }));
		vi.stubGlobal('fetch', fetchSpy);
		const body = JSON.stringify({ user: { phone: '15550001111' }, sms: { otp: '654321' } });
		const s = sign(body);
		const res = await call(body, { 'webhook-id': s.id, 'webhook-timestamp': s.timestamp, 'webhook-signature': s.signature });
		expect(res.status).toBe(200);
		expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({ to: '+15550001111', text: smsText('654321') });
	});

	it('reports a Telnyx failure in the hook error shape', async () => {
		vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ errors: [{ detail: 'nope' }] }), { status: 400 }));
		const body = JSON.stringify({ user: { phone: '15550001111' }, sms: { otp: '1' } });
		const s = sign(body);
		const res = await call(body, { 'webhook-id': s.id, 'webhook-timestamp': s.timestamp, 'webhook-signature': s.signature });
		expect(res.status).toBe(502);
		expect((await res.json()).error.http_code).toBe(502);
	});
});
