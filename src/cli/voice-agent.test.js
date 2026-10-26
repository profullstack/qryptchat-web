import { describe, expect, it, vi } from 'vitest';
import { encodeWav } from '../lib/chat/voice-recorder.js';
import { CallSession, askBrain, e2eeOptions, parseBrain, splitSentences, userIdOf, wavSamples } from './voice-agent.js';

describe('voice agent helpers', () => {
	it('derives the call key the way the browser does (HKDF, LiveKit salt)', () => {
		const o = e2eeOptions(new Uint8Array(32).fill(1)).keyProviderOptions;
		expect(o.keyDerivationFunction).toBe(1);
		expect(new TextDecoder().decode(o.ratchetSalt)).toBe('LKFrameEncryptionKey');
		expect(o.sharedKey).toHaveLength(32);
	});

	it('reads the qrypt user id from a partner identity', () => {
		expect(userIdOf('qrypt:4826dea7-225a')).toBe('4826dea7-225a');
		expect(userIdOf('plain')).toBe('plain');
	});

	it('splits speech into sentences and keeps short ones together', () => {
		expect(splitSentences('Deployed. All green! Want the link?', 25)).toEqual(['Deployed. All green!', 'Want the link?']);
		expect(splitSentences('no punctuation here')).toEqual(['no punctuation here']);
	});

	it('takes SAY from the brain and treats anything else as silence', () => {
		expect(parseBrain('SAY: on it, checking the deploy')).toBe('on it, checking the deploy');
		expect(parseBrain('thinking...\nSAY: two\nlines')).toBe('two\nlines');
		expect(parseBrain('PASS')).toBe('');
		expect(parseBrain('')).toBe('');
	});

	it('reads samples back out of a WAV', () => {
		const wav = encodeWav(new Float32Array([0, 0.5, -0.5]), 24000);
		expect(Array.from(wavSamples(wav))).toEqual([0, 16383, -16384]);
	});

	it('runs the brain command with the turn on stdin', async () => {
		const r = await askBrain(`node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log('SAY: heard ' + JSON.parse(d).text))"`, { text: 'hello' });
		expect(r).toEqual({ say: 'heard hello', error: '' });
		const bad = await askBrain('exit 3', {});
		expect(bad.say).toBe('');
		expect(bad.error).toMatch(/exited 3/);
	});
});

describe('CallSession', () => {
	const make = (brain, tts) => {
		const frames = [];
		const sent = [];
		const client = {
			me: { id: 'agent', username: 'riotcoder' },
			base: 'https://q',
			token: async () => 'tok',
			send: vi.fn(async (id, text) => sent.push(text)),
			fetch: vi.fn(async (url, init) => {
				if (url.endsWith('/api/voice/transcribe')) return { ok: true, json: async () => ({ text: 'is the deploy green?' }) };
				if (url.endsWith('/api/voice/speak')) return { ok: true, arrayBuffer: async () => encodeWav(new Float32Array(480).fill(0.1), 24000).buffer };
				if (url === 'http://kokoro/speak') return init.body.includes('broken') ? { ok: false, status: 500 } : { ok: true, arrayBuffer: async () => encodeWav(new Float32Array(240).fill(0.2), 24000).buffer };
				throw new Error(url);
			}),
		};
		const rtc = { AudioFrame: class { constructor(data) { this.data = data; } } };
		const s = new CallSession({
			client,
			rtc,
			conversation: { id: 'g1', title: 'Agents', participants: [{ user_id: 'h', user: { username: 'chovy' } }] },
			call: { key: new Uint8Array(32) },
			brain,
			tts,
			voice: 'orion',
			post: true,
			log: () => {},
			isHuman: (id) => id === 'h',
		});
		s.source = { captureFrame: async (f) => frames.push(f), clearQueue: vi.fn(), waitForPlayout: async () => {} };
		return { s, client, frames, sent };
	};

	it('transcribes what a person said, asks the brain, posts and speaks the answer', async () => {
		const brain = `node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('SAY: ' + j.speaker + ' asked: ' + j.text)})"`;
		const { s, client, frames, sent } = make(brain);
		await s.heard(new Float32Array(1600), 'chovy', 'h');
		const [, init] = client.fetch.mock.calls[0];
		expect(init.headers['Content-Type']).toBe('audio/wav');
		expect(decodeURIComponent(init.headers['X-Voice-Hint'])).toBe('chovy');
		expect(sent).toEqual(['🔊 chovy asked: is the deploy green?']);
		expect(JSON.parse(client.fetch.mock.calls[1][1].body)).toEqual({ text: 'chovy asked: is the deploy green?', voice: 'orion' });
		expect(frames).toHaveLength(2); // 480 samples at 24 kHz = two 10 ms frames
		expect(s.transcript.map((t) => t.who)).toEqual(['chovy', 'riotcoder (you)']);
	});

	it('speaks with its own voice server and falls back to qrypt.chat when it fails', async () => {
		const { s, client, frames } = make('echo PASS', 'http://kokoro/speak');
		await s.tts('fine').then((pcm) => expect(pcm.length).toBe(240));
		const pcm = await s.tts('broken');
		expect(pcm.length).toBe(480);
		expect(client.fetch.mock.calls.map(([u]) => u)).toEqual(['http://kokoro/speak', 'http://kokoro/speak', 'https://q/api/voice/speak']);
		expect(frames).toEqual([]);
	});

	it('stays quiet on PASS and stops talking when interrupted', async () => {
		const { s, frames, sent } = make('echo PASS');
		await s.heard(new Float32Array(1600), 'chovy', 'h');
		expect(frames).toEqual([]);
		expect(sent).toEqual([]);
		s.speaking = true;
		s.bargeIn();
		expect(s.source.clearQueue).toHaveBeenCalled();
		expect(s.speaking).toBe(false);
	});
});
