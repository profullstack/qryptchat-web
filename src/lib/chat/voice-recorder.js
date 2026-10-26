/**
 * A stand-in for SpeechRecognition where the browser has none that works:
 * iOS home-screen apps (WebKit leaves SpeechRecognition out of them), Safari
 * with Siri off, Firefox, Chromium builds without Google's speech service.
 *
 * It records one utterance (MediaRecorder, or raw audio packed into a WAV
 * file on iOS, where MediaRecorder is unreliable in home-screen apps), finds the pause itself from
 * the microphone level, sends the clip to /api/voice/transcribe and reports
 * the text through the same events as SpeechRecognition (onresult, onerror,
 * onend, plus onspeechstart/onaudioend), so voice mode drives either one.
 * The microphone is released after every utterance so replies play through
 * the speaker at full volume on iPhone.
 */

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac'];

let sharedContext = null;

/** The AudioContext used to measure the mic level. iOS only lets it run if it was resumed during a tap. */
export function audioContext(win = globalThis) {
	const Ctx = win.AudioContext || win.webkitAudioContext;
	if (!Ctx) return null;
	if (!sharedContext || sharedContext.state === 'closed') sharedContext = new Ctx();
	return sharedContext;
}

/** Call from a tap: wakes the AudioContext so later turns can measure without one. */
export function unlockAudio(win = globalThis) {
	try {
		audioContext(win)?.resume?.();
	} catch {}
}

/** iPhone, iPad (which reports itself as a Mac) or iPod. */
export function isIOS(win = globalThis) {
	const nav = win?.navigator || {};
	return /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** What recording needs that this browser lacks (empty when it can record). */
export function micMissing(win = globalThis) {
	const missing = [];
	if (!win?.isSecureContext && win?.isSecureContext !== undefined) missing.push('a secure (https) page');
	if (!win?.navigator?.mediaDevices?.getUserMedia) missing.push('microphone access (navigator.mediaDevices)');
	if (!(win?.AudioContext || win?.webkitAudioContext)) missing.push('Web Audio');
	return missing;
}

/** Whether this browser can record a clip for server transcription (MediaRecorder is optional: WAV fallback). */
export function canRecord(win = globalThis) {
	return micMissing(win).length === 0;
}

/** Record raw audio and pack a WAV instead of using MediaRecorder: iOS, or browsers without it. */
export const useWav = (win = globalThis) => isIOS(win) || !win?.MediaRecorder;

/** Average-downsample mono float samples, e.g. 48 kHz to 16 kHz for speech. */
export function downsample(samples, from, to = 16000) {
	if (from <= to) return samples;
	const ratio = from / to;
	const out = new Float32Array(Math.floor(samples.length / ratio));
	for (let i = 0; i < out.length; i++) {
		const start = Math.floor(i * ratio);
		const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
		let sum = 0;
		for (let j = start; j < end; j++) sum += samples[j];
		out[i] = sum / Math.max(1, end - start);
	}
	return out;
}

/** 16-bit PCM mono WAV bytes. */
export function encodeWav(samples, sampleRate) {
	const buf = new ArrayBuffer(44 + samples.length * 2);
	const v = new DataView(buf);
	const str = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
	str(0, 'RIFF');
	v.setUint32(4, 36 + samples.length * 2, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, 1, true);
	v.setUint32(24, sampleRate, true);
	v.setUint32(28, sampleRate * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	str(36, 'data');
	v.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const x = Math.max(-1, Math.min(1, samples[i]));
		v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
	}
	return new Uint8Array(buf);
}

export function recorderMimeType(MR = globalThis.MediaRecorder) {
	return MIME_TYPES.find((t) => MR?.isTypeSupported?.(t)) || '';
}

/** iOS Safari's audio session (Safari 17+): record mode while listening, playback mode while speaking. */
export function setAudioSession(type, win = globalThis) {
	try {
		if (win?.navigator?.audioSession) win.navigator.audioSession.type = type;
	} catch {}
}

/**
 * Speech/silence from a stream of RMS levels, sampled every `stepMs`.
 * Calibrates the noise floor on the first samples so a noisy room still ends.
 */
export function createEndpointer({ stepMs = 50, silenceMs = 1100, noSpeechMs = 8000, maxMs = 60000, minLevel = 0.012, maxThreshold = 0.05 } = {}) {
	let t = 0;
	let floor = null;
	let loud = 0;
	let quietFor = 0;
	let spoke = false;
	return {
		get spoke() {
			return spoke;
		},
		/** Feed one level; returns 'speech-start' | 'end' | 'no-speech' | 'max' | null. */
		push(rms) {
			t += stepMs;
			if (t <= 300) {
				floor = floor === null ? rms : Math.min(floor, rms);
				return null;
			}
			// Capped, so talking the moment the mic opens cannot calibrate the voice itself as "silence".
			const threshold = Math.max(minLevel, Math.min(maxThreshold, (floor ?? 0) * 3));
			if (rms > threshold) {
				loud += 1;
				quietFor = 0;
				if (!spoke && loud >= 3) {
					spoke = true;
					return 'speech-start';
				}
			} else {
				loud = 0;
				quietFor += stepMs;
				if (!spoke) floor = floor === null ? rms : floor * 0.95 + rms * 0.05;
			}
			if (spoke && quietFor >= silenceMs) return 'end';
			if (!spoke && t >= noSpeechMs) return 'no-speech';
			if (t >= maxMs) return 'max';
			return null;
		},
	};
}

/** Upload a clip; resolves to the text. */
export async function transcribeClip(blob, { lang, hints = [], fetchImpl = fetch } = {}) {
	const res = await fetchImpl('/api/voice/transcribe', {
		method: 'POST',
		headers: {
			'Content-Type': (blob.type || 'audio/webm').split(';')[0],
			'X-Voice-Lang': lang || '',
			'X-Voice-Hint': encodeURIComponent(hints.filter(Boolean).join(',')),
		},
		body: blob,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const err = new Error(data.error || `Transcription failed (${res.status})`);
		err.status = res.status;
		throw err;
	}
	return String(data.text || '');
}

export class RecorderRecognition {
	constructor() {
		this.lang = '';
		this.hints = [];
		this.onresult = this.onerror = this.onend = this.onspeechstart = this.onaudioend = null;
		this._done = false;
	}

	async start() {
		const win = globalThis;
		if (!canRecord(win)) return this._fail('audio-capture', `This app can't reach the microphone here: missing ${micMissing(win).join(', ')}.`);
		setAudioSession('play-and-record', win);
		try {
			this._stream = await win.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
		} catch (e) {
			const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
			return this._fail(denied ? 'not-allowed' : 'audio-capture');
		}
		if (this._done) return this._release();

		const ctx = audioContext(win);
		try {
			await ctx.resume?.();
		} catch {}
		const source = ctx.createMediaStreamSource(this._stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		source.connect(analyser);
		this._source = source;
		const buf = new Float32Array(analyser.fftSize);

		if (useWav(win)) {
			// Raw samples through a ScriptProcessor (supported everywhere, iOS included); its output stays silent.
			const proc = ctx.createScriptProcessor(4096, 1, 1);
			const pcm = [];
			proc.onaudioprocess = (e) => pcm.push(new Float32Array(e.inputBuffer.getChannelData(0)));
			source.connect(proc);
			proc.connect(ctx.destination);
			this._proc = proc;
			this._wav = () => {
				const all = new Float32Array(pcm.reduce((n, c) => n + c.length, 0));
				let o = 0;
				for (const c of pcm) {
					all.set(c, o);
					o += c.length;
				}
				return new Blob([encodeWav(downsample(all, ctx.sampleRate), Math.min(ctx.sampleRate, 16000))], { type: 'audio/wav' });
			};
		} else {
			const mimeType = recorderMimeType(win.MediaRecorder);
			const rec = new win.MediaRecorder(this._stream, mimeType ? { mimeType } : undefined);
			const chunks = [];
			rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
			rec.onstop = () => this._finish(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
			this._rec = rec;
			rec.start();
		}

		const ep = createEndpointer();
		this._endpointer = ep;
		this._timer = setInterval(() => {
			analyser.getFloatTimeDomainData(buf);
			let sum = 0;
			for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
			const ev = ep.push(Math.sqrt(sum / buf.length));
			if (ev === 'speech-start') this.onspeechstart?.();
			else if (ev === 'no-speech') {
				this._noSpeech = true;
				this.stop();
			} else if (ev === 'end' || ev === 'max') this.stop();
		}, 50);
	}

	/** Stop listening and transcribe what was heard. */
	stop() {
		clearInterval(this._timer);
		if (this._wav) {
			const make = this._wav;
			this._wav = null;
			return this._finish(this._aborted ? null : make());
		}
		if (this._rec && this._rec.state !== 'inactive') {
			try {
				this._rec.stop();
				return;
			} catch {}
		}
		this._finish(null);
	}

	/** Stop listening and drop it. */
	abort() {
		this._aborted = true;
		this.stop();
	}

	async _finish(blob) {
		if (this._done) return;
		this._done = true;
		clearInterval(this._timer);
		this._release();
		this.onaudioend?.();
		if (this._aborted) {
			this.onerror?.({ error: 'aborted' });
			return this.onend?.();
		}
		if (this._noSpeech || !this._endpointer?.spoke || !blob?.size) {
			this.onerror?.({ error: 'no-speech' });
			return this.onend?.();
		}
		try {
			const text = await transcribeClip(blob, { lang: this.lang, hints: this.hints });
			if (this._aborted) return;
			if (text) {
				const r = [{ transcript: text, confidence: 1 }];
				r.isFinal = true;
				this.onresult?.({ resultIndex: 0, results: [r] });
			} else this.onerror?.({ error: 'no-speech' });
		} catch (e) {
			this.onerror?.({ error: e.status === 429 ? 'rate-limited' : 'network', message: e.message });
		}
		this.onend?.();
	}

	_fail(error, message) {
		this._done = true;
		this._release();
		this.onerror?.({ error, message });
		this.onend?.();
	}

	_release() {
		try {
			this._source?.disconnect();
			if (this._proc) {
				this._proc.onaudioprocess = null;
				this._proc.disconnect();
			}
		} catch {}
		this._stream?.getTracks().forEach((t) => t.stop());
		this._stream = null;
		setAudioSession('playback');
	}
}
