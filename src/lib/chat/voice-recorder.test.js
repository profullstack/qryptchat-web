import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecorderRecognition, createEndpointer, downsample, encodeWav, micMissing, recorderMimeType, transcribeClip, useWav } from './voice-recorder.js';

describe('WAV fallback', () => {
	it('packs 16-bit mono PCM with a valid header', () => {
		const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
		const v = new DataView(wav.buffer);
		const str = (o) => String.fromCharCode(...wav.slice(o, o + 4));
		expect([str(0), str(8), str(12), str(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
		expect(v.getUint32(24, true)).toBe(16000);
		expect(v.getUint32(40, true)).toBe(8);
		expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768]);
	});

	it('downsamples 48 kHz to 16 kHz by averaging', () => {
		const out = downsample(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48000);
		expect(Array.from(out).map((x) => +x.toFixed(2))).toEqual([0.3, 1]);
		const same = new Float32Array([1]);
		expect(downsample(same, 16000)).toBe(same);
	});

	it('uses WAV on iOS or without MediaRecorder, and names what is missing', () => {
		const iphone = { navigator: { userAgent: 'iPhone' }, MediaRecorder: function () {} };
		expect(useWav(iphone)).toBe(true);
		expect(useWav({ navigator: { userAgent: 'Chrome' }, MediaRecorder: function () {} })).toBe(false);
		expect(useWav({ navigator: { userAgent: 'Firefox' } })).toBe(true);
		expect(micMissing({ isSecureContext: true, navigator: {}, AudioContext: function () {} })).toEqual(['microphone access (navigator.mediaDevices)']);
		expect(micMissing({ isSecureContext: true, navigator: { mediaDevices: { getUserMedia() {} } }, webkitAudioContext: function () {} })).toEqual([]);
	});
});

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
	let procs;
	beforeEach(() => {
		procs = [];
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
			createScriptProcessor() {
				procs.push({ connect() {}, disconnect() {} });
				return procs.at(-1);
			}
			get sampleRate() {
				return 48000;
			}
			get destination() {
				return {};
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

	it('records a WAV without MediaRecorder (the iOS path) and transcribes it', async () => {
		delete window.MediaRecorder;
		const rec = new RecorderRecognition();
		const events = [];
		rec.onresult = (e) => events.push(e.results[0][0].transcript);
		rec.onend = () => events.push('end');
		await rec.start();
		const feed = (v) => procs[0].onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4800).fill(v) } });
		await vi.advanceTimersByTimeAsync(400);
		level = 0.2;
		feed(0.2);
		await vi.advanceTimersByTimeAsync(600);
		level = 0.001;
		feed(0);
		await vi.advanceTimersByTimeAsync(1500);
		expect(events).toEqual(['deploy crawlproof', 'end']);
		const [, init] = fetch.mock.calls[0];
		expect(init.headers['Content-Type']).toBe('audio/wav');
		expect(init.body.size).toBe(44 + 2 * 3200);
		expect(procs[0].onaudioprocess).toBeNull();
	});

	it("says what is missing when the page can't reach the microphone", async () => {
		delete navigator.mediaDevices;
		const rec = new RecorderRecognition();
		const events = [];
		rec.onerror = (e) => events.push(`${e.error}: ${e.message}`);
		await rec.start();
		expect(events[0]).toMatch(/^audio-capture: .*navigator\.mediaDevices/);
	});
});
