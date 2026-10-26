import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecorderRecognition, createEndpointer, recorderMimeType, transcribeClip } from './voice-recorder.js';

const feed = (ep, level, ms) => {
	const out = [];
	for (let t = 0; t < ms; t += 50) out.push(ep.push(level));
	return out.filter(Boolean);
};

describe('createEndpointer', () => {
	it('starts on speech and ends after a pause', () => {
		const ep = createEndpointer();
		expect(feed(ep, 0.002, 400)).toEqual([]);
		expect(feed(ep, 0.2, 500)).toEqual(['speech-start']);
		expect(feed(ep, 0.003, 1200)[0]).toBe('end');
	});

	it('gives up when nobody speaks, and caps a long turn', () => {
		expect(feed(createEndpointer({ noSpeechMs: 2000 }), 0.001, 2500)).toContain('no-speech');
		// Talking from the first instant still counts as speech.
		const ep = createEndpointer({ maxMs: 3000 });
		expect(feed(ep, 0.3, 3200).slice(0, 2)).toEqual(['speech-start', 'max']);
	});

	it('treats a steady noisy room as silence', () => {
		const ep = createEndpointer();
		feed(ep, 0.03, 300);
		expect(feed(ep, 0.035, 2000)).toEqual([]);
		expect(feed(ep, 0.3, 300)).toEqual(['speech-start']);
	});
});

describe('transcribeClip', () => {
	it('posts the clip with the language and URI-encoded names', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'ship it' }) }));
		const blob = new Blob(['x'], { type: 'audio/mp4' });
		expect(await transcribeClip(blob, { lang: 'en-US', hints: ['riotcoder', 'Zoë'], fetchImpl })).toBe('ship it');
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('/api/voice/transcribe');
		expect(init.headers).toEqual({ 'Content-Type': 'audio/mp4', 'X-Voice-Lang': 'en-US', 'X-Voice-Hint': 'riotcoder%2CZo%C3%AB' });
	});

	it('throws with the status on failure', async () => {
		const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({ error: 'slow down' }) });
		await expect(transcribeClip(new Blob(['x']), { fetchImpl })).rejects.toMatchObject({ status: 429, message: 'slow down' });
	});

	it('picks the first container the recorder supports', () => {
		expect(recorderMimeType({ isTypeSupported: (t) => t === 'audio/mp4' })).toBe('audio/mp4');
		expect(recorderMimeType(undefined)).toBe('');
	});
});

describe('RecorderRecognition', () => {
	let level;
	let track;
	beforeEach(() => {
		vi.useFakeTimers();
		level = 0.001;
		track = { stop: vi.fn() };
		navigator.mediaDevices = { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) };
		window.AudioContext = class {
			resume() {}
			createMediaStreamSource() {
				return { connect() {}, disconnect() {} };
			}
			createAnalyser() {
				return { fftSize: 0, getFloatTimeDomainData: (buf) => buf.fill(level) };
			}
		};
		window.MediaRecorder = class {
			static isTypeSupported = (t) => t === 'audio/mp4';
			constructor() {
				this.state = 'inactive';
				this.mimeType = 'audio/mp4';
			}
			start() {
				this.state = 'recording';
			}
			stop() {
				this.state = 'inactive';
				this.ondataavailable({ data: new Blob(['audio'], { type: 'audio/mp4' }) });
				this.onstop();
			}
		};
		globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'deploy crawlproof' }) }));
	});
	afterEach(() => {
		vi.useRealTimers();
		delete navigator.mediaDevices;
		delete window.AudioContext;
		delete window.MediaRecorder;
	});

	it('records until the pause, transcribes, and frees the mic', async () => {
		const rec = new RecorderRecognition();
		const events = [];
		rec.onspeechstart = () => events.push('speechstart');
		rec.onaudioend = () => events.push('audioend');
		rec.onresult = (e) => events.push(`result:${e.results[0][0].transcript}:${e.results[0].isFinal}`);
		rec.onend = () => events.push('end');
		await rec.start();
		await vi.advanceTimersByTimeAsync(400);
		level = 0.2;
		await vi.advanceTimersByTimeAsync(600);
		level = 0.001;
		await vi.advanceTimersByTimeAsync(1500);
		expect(events).toEqual(['speechstart', 'audioend', 'result:deploy crawlproof:true', 'end']);
		expect(track.stop).toHaveBeenCalled();
		expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('audio/mp4');
	});

	it('reports no-speech without uploading when nobody talks', async () => {
		const rec = new RecorderRecognition();
		const events = [];
		rec.onerror = (e) => events.push(e.error);
		rec.onend = () => events.push('end');
		await rec.start();
		await vi.advanceTimersByTimeAsync(9000);
		expect(events).toEqual(['no-speech', 'end']);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('reports a denied microphone as not-allowed', async () => {
		navigator.mediaDevices.getUserMedia = async () => {
			throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
		};
		const rec = new RecorderRecognition();
		const events = [];
		rec.onerror = (e) => events.push(e.error);
		rec.onend = () => events.push('end');
		await rec.start();
		expect(events).toEqual(['not-allowed', 'end']);
	});
});
