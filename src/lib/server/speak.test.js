import { describe, expect, it, vi } from 'vitest';
import { pickSpeaker, speak } from './speak.js';

const env = { CF_AI_ACCOUNT_ID: 'acct', CF_AI_TOKEN: 'tok' };
const wav = () => {
	const b = new Uint8Array(100);
	b.set([82, 73, 70, 70]); // RIFF
	return b;
};

describe('speak', () => {
	it('asks Aura 2 for 24 kHz WAV in the chosen voice', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => wav().buffer }));
		const out = await speak('  Hello\n there ', { voice: 'Luna', env, fetchImpl });
		expect(out.length).toBe(100);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/deepgram/aura-2-en');
		expect(JSON.parse(init.body)).toEqual({ text: 'Hello there', speaker: 'luna', encoding: 'linear16', container: 'wav', sample_rate: 24000 });
	});

	it('refuses empty, overlong or unconfigured requests and reports provider errors', async () => {
		await expect(speak('hi', { env: {} })).rejects.toMatchObject({ status: 503 });
		await expect(speak('  ', { env })).rejects.toMatchObject({ status: 400 });
		await expect(speak('x'.repeat(1001), { env })).rejects.toMatchObject({ status: 413 });
		const err = new TextEncoder().encode(JSON.stringify({ errors: [{ message: 'busy' }] }));
		const fetchImpl = async () => ({ ok: false, status: 500, arrayBuffer: async () => err.buffer });
		await expect(speak('hi', { env, fetchImpl })).rejects.toThrow('Speech failed: busy');
	});

	it('falls back to orion for unknown voices', () => {
		expect(pickSpeaker('zeus')).toBe('zeus');
		expect(pickSpeaker('nope')).toBe('orion');
		expect(pickSpeaker(undefined)).toBe('orion');
	});
});
