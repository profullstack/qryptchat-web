import { describe, expect, it, vi } from 'vitest';
import { TranscribeError, cleanHint, cleanTranscript, isAudioType, transcribe } from './transcribe.js';

const env = { CF_AI_ACCOUNT_ID: 'acct', CF_AI_TOKEN: 'tok' };
const ok = (text) => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: { text } }) }));

describe('transcribe', () => {
	it('sends the clip to Workers AI Whisper with the language and the names', async () => {
		const fetchImpl = ok(' Hey riotcoder, ship it. ');
		const text = await transcribe(new Uint8Array([1, 2, 3]), { lang: 'en-US', hint: 'riotcoder, cha0spunk', env, fetchImpl });
		expect(text).toBe('Hey riotcoder, ship it.');
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/openai/whisper-large-v3-turbo');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toEqual({ audio: 'AQID', language: 'en', initial_prompt: 'Names: riotcoder, cha0spunk.' });
	});

	it('refuses without credentials, empty or huge clips, and reports provider errors', async () => {
		await expect(transcribe(new Uint8Array([1]), { env: {} })).rejects.toMatchObject({ status: 503 });
		expect(await transcribe(new Uint8Array(), { env, fetchImpl: ok('x') })).toBe('');
		await expect(transcribe(new Uint8Array(9 * 1024 * 1024), { env, fetchImpl: ok('x') })).rejects.toMatchObject({ status: 413 });
		const bad = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ success: false, errors: [{ message: 'bad audio' }] }) }));
		await expect(transcribe(new Uint8Array([1]), { env, fetchImpl: bad })).rejects.toThrow(TranscribeError);
	});

	it("drops Whisper's phantom phrases for silence", () => {
		for (const t of ['Thank you.', ' you ', 'Thanks for watching!', '']) expect(cleanTranscript(t)).toBe('');
		expect(cleanTranscript('Thank you, now deploy it')).toBe('Thank you, now deploy it');
	});

	it('accepts browser recording types only and cleans the hint', () => {
		for (const t of ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg']) expect(isAudioType(t)).toBe(true);
		for (const t of ['text/plain', 'application/json', '', 'audio/x-evil']) expect(isAudioType(t)).toBe(false);
		expect(cleanHint(encodeURIComponent('riotcoder,cha0spunk,🤖 bot,<script>'))).toBe('riotcoder, cha0spunk, bot, script');
		expect(cleanHint('%E0%A4%A')).toBe('');
	});
});
