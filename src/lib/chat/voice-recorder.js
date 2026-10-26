/**
 * A stand-in for SpeechRecognition where the browser has none that works:
 * iOS home-screen apps (WebKit leaves SpeechRecognition out of them), Safari
 * with Siri off, Firefox, Chromium builds without Google's speech service.
 *
 * It records one utterance with MediaRecorder, finds the pause itself from
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

/** Whether this browser can record a clip for server transcription. */
export function canRecord(win = globalThis) {
	return !!(win?.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder && (win.AudioContext || win.webkitAudioContext));
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

		const mimeType = recorderMimeType(win.MediaRecorder);
		const rec = new win.MediaRecorder(this._stream, mimeType ? { mimeType } : undefined);
		const chunks = [];
		rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
		rec.onstop = () => this._finish(new Blob(chunks, { type: rec.mimeType || mimeType || 'audio/webm' }));
		this._rec = rec;
		rec.start();

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

	_fail(error) {
		this._done = true;
		this._release();
		this.onerror?.({ error });
		this.onend?.();
	}

	_release() {
		try {
			this._source?.disconnect();
		} catch {}
		this._stream?.getTracks().forEach((t) => t.stop());
		this._stream = null;
		setAudioSession('playback');
	}
}
