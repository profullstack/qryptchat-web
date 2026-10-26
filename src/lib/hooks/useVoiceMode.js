'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	NATIVE_UNUSABLE,
	dictatedMessage,
	isStopPhrase,
	nameHints,
	onDeviceRecognition,
	pickEngine,
	pickVoice,
	recognitionCtor,
	shouldSpeak,
	spokenLine,
	voiceSupport,
} from '@/lib/chat/voice-mode.js';
import { RecorderRecognition, canRecord, micMissing, setAudioSession, unlockAudio } from '@/lib/chat/voice-recorder.js';

/** Chrome stops reading an utterance after ~15 s, so long replies go out in sentence-sized pieces. */
function chunks(text, max = 220) {
	const out = [];
	let cur = '';
	for (const s of text.match(/[^.!?]+[.!?]*\s*/g) || [text]) {
		if (cur && (cur + s).length > max) {
			out.push(cur.trim());
			cur = '';
		}
		cur += s;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

const MAX_SILENT_TURNS = 3;
// Native recognition that goes quiet (no result, error or end) is restarted after this long.
const LISTEN_WATCHDOG_MS = 20000;

/**
 * Hands-free voice conversation with a chat.
 *
 * phase: off | listening | waiting (sent, waiting for a reply) | speaking | paused (tap to talk)
 * stage (while listening): '' | 'hearing' | 'transcribing'
 * engine: 'on-device' | 'browser' | 'server' (what turns speech into text)
 */
export function useVoiceMode({ conversation, messages, selfId, send }) {
	const [phase, setPhase] = useState('off');
	const [stage, setStage] = useState('');
	const [transcript, setTranscript] = useState('');
	const [engine, setEngine] = useState(null);
	const [muted, setMuted] = useState(false);
	const [error, setError] = useState('');
	const [support, setSupport] = useState({ listen: false, speak: false });

	const phaseRef = useRef('off');
	const recRef = useRef(null);
	const heardRef = useRef('');
	const silentRef = useRef(0);
	const queueRef = useRef([]);
	const seenRef = useRef(new Set());
	const sinceRef = useRef(0);
	const speakTokenRef = useRef(0);
	const mutedRef = useRef(false);
	const engineRef = useRef(null);
	const onDeviceRef = useRef(false);
	const latest = useRef({ conversation, send, selfId });
	latest.current = { conversation, send, selfId };

	useEffect(() => setSupport(voiceSupport(window)), []);

	const lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

	const go = useCallback((p) => {
		phaseRef.current = p;
		setPhase(p);
		if (p !== 'listening') setStage('');
	}, []);

	const chooseEngine = useCallback((e) => {
		engineRef.current = e;
		setEngine(e === 'native' ? (onDeviceRef.current ? 'on-device' : 'browser') : e);
	}, []);

	const stopListening = useCallback(() => {
		const rec = recRef.current;
		recRef.current = null;
		if (rec) {
			clearTimeout(rec._watchdog);
			rec.onresult = rec.onerror = rec.onend = rec.onspeechstart = rec.onaudioend = null;
			try {
				rec.abort();
			} catch {}
		}
	}, []);

	const stopSpeaking = useCallback(() => {
		speakTokenRef.current++;
		try {
			window.speechSynthesis?.cancel();
		} catch {}
	}, []);

	// Declared as refs so listen/speak/next can call each other without stale closures.
	const listenRef = useRef(() => {});
	const nextRef = useRef(() => {});

	/** Speak the next queued reply, or go back to listening when there is none. */
	nextRef.current = () => {
		if (phaseRef.current === 'off') return;
		const item = queueRef.current.shift();
		if (!item) return listenRef.current();
		const synth = window.speechSynthesis;
		if (!synth || mutedRef.current) return nextRef.current();
		go('speaking');
		setAudioSession('playback');
		const token = ++speakTokenRef.current;
		const done = () => {
			if (token !== speakTokenRef.current) return;
			clearTimeout(watchdog);
			nextRef.current();
		};
		// iOS sometimes never fires onend; move on once the reply has surely finished.
		const watchdog = setTimeout(() => {
			if (token !== speakTokenRef.current) return;
			speakTokenRef.current++;
			try {
				synth.cancel();
			} catch {}
			nextRef.current();
		}, 6000 + item.text.length * 110);
		const voice = pickVoice(synth.getVoices(), lang, item.speaker);
		const parts = chunks(item.text);
		parts.forEach((part, i) => {
			const u = new SpeechSynthesisUtterance(part);
			u.lang = voice?.lang || lang;
			if (voice) u.voice = voice;
			if (i === parts.length - 1) u.onend = u.onerror = done;
			synth.speak(u);
		});
	};

	listenRef.current = () => {
		if (phaseRef.current === 'off') return;
		const kind = engineRef.current;
		const Ctor = kind === 'native' ? recognitionCtor(window) : kind === 'server' ? RecorderRecognition : null;
		if (!Ctor) {
			const missing = micMissing(window);
			setError(`Voice can't start here: ${missing.length ? `missing ${missing.join(', ')}` : 'no speech recognition and no way to record'}.`);
			return go('paused');
		}
		stopListening();
		heardRef.current = '';
		setTranscript('');
		setStage('');
		const rec = new Ctor();
		rec.lang = lang;
		rec.interimResults = true;
		rec.continuous = false;
		rec.maxAlternatives = 1;
		rec.hints = nameHints(latest.current.conversation, latest.current.selfId);
		if (kind === 'native' && onDeviceRef.current) rec.processLocally = true;
		let noSpeech = false;
		let blocked = false;
		let switchEngine = false;
		let ended = false;

		const arm = () => {
			clearTimeout(rec._watchdog);
			if (kind === 'native') rec._watchdog = setTimeout(() => {
				noSpeech = true;
				try {
					rec.abort();
				} catch {}
				end();
			}, LISTEN_WATCHDOG_MS);
		};

		const end = () => {
			if (ended || recRef.current !== rec) return;
			ended = true;
			clearTimeout(rec._watchdog);
			recRef.current = null;
			const said = heardRef.current.trim();
			if (said) {
				silentRef.current = 0;
				setTranscript('');
				if (isStopPhrase(said)) return stop();
				go('waiting');
				Promise.resolve(latest.current.send(dictatedMessage(said)))
					.then((r) => {
						if (r && r.success === false) setError(r.error || 'Failed to send');
					})
					.catch((err) => setError(err?.message || 'Failed to send'))
					.finally(() => {
						// A reply that came in while sending is spoken now.
						if (phaseRef.current === 'waiting' && queueRef.current.length) nextRef.current();
					});
				return;
			}
			if (phaseRef.current !== 'listening') return;
			if (blocked) return go('paused');
			if (switchEngine) return listenRef.current();
			if (queueRef.current.length) return nextRef.current();
			if (noSpeech && ++silentRef.current < MAX_SILENT_TURNS) return listenRef.current();
			go('paused');
		};

		rec.onspeechstart = () => {
			rec._heard = true;
			setStage('hearing');
		};
		rec.onaudioend = () => {
			if (kind === 'server' && recRef.current === rec) setStage('transcribing');
		};
		rec.onresult = (e) => {
			arm();
			let final = '';
			let interim = '';
			for (let i = 0; i < e.results.length; i++) {
				const r = e.results[i];
				if (r.isFinal) final += r[0].transcript;
				else interim += r[0].transcript;
			}
			heardRef.current = final;
			setTranscript((final + interim).trim());
		};
		rec.onerror = (e) => {
			if (e.error === 'no-speech') noSpeech = true;
			else if (e.error === 'not-allowed') {
				setError('Microphone access is blocked. Allow it for qrypt.chat in your browser or iOS settings.');
				blocked = true;
			} else if (kind === 'native' && NATIVE_UNUSABLE.includes(e.error) && canRecord(window)) {
				// The browser's recognizer is unavailable here: record and transcribe instead.
				chooseEngine('server');
				switchEngine = true;
			} else if (e.error === 'rate-limited') {
				setError('Too many voice messages for now. Try again in a minute.');
				blocked = true;
			} else if (e.error !== 'aborted') {
				setError(e.message || `Speech recognition: ${e.error}`);
				blocked = true;
			}
		};
		rec.onend = end;
		recRef.current = rec;
		go('listening');
		arm();
		try {
			const started = rec.start();
			// The recorder starts asynchronously; a failure arrives through onerror/onend.
			if (started?.catch) started.catch(() => {});
		} catch (err) {
			clearTimeout(rec._watchdog);
			recRef.current = null;
			setError(err?.message || 'Could not start the microphone');
			go('paused');
		}
	};

	const stop = useCallback(() => {
		phaseRef.current = 'off';
		stopListening();
		stopSpeaking();
		queueRef.current = [];
		setTranscript('');
		setStage('');
		setPhase('off');
	}, [stopListening, stopSpeaking]);

	/** Turn voice mode on. Must run from a tap: browsers only unlock audio and the mic on a user gesture. */
	const start = useCallback(() => {
		setError('');
		silentRef.current = 0;
		queueRef.current = [];
		sinceRef.current = Date.now();
		seenRef.current = new Set((messages || []).map((m) => m.id));
		// iOS only lets speech and Web Audio play later if they were started during the tap.
		unlockAudio();
		try {
			const synth = window.speechSynthesis;
			synth?.cancel();
			synth?.speak(new SpeechSynthesisUtterance(''));
		} catch {}
		phaseRef.current = 'starting';
		const kind = engineRef.current || pickEngine(window);
		chooseEngine(kind);
		if (kind === 'native') {
			onDeviceRecognition(recognitionCtor(window), lang).then((local) => {
				onDeviceRef.current = local;
				if (engineRef.current === 'native') chooseEngine('native');
			});
		}
		listenRef.current();
	}, [messages, lang, chooseEngine]);

	/** Tap to talk: interrupts whatever is being read and listens now. */
	const talk = useCallback(() => {
		if (phaseRef.current === 'off') return start();
		setError('');
		silentRef.current = 0;
		unlockAudio();
		stopSpeaking();
		queueRef.current = [];
		listenRef.current();
	}, [start, stopSpeaking]);

	/** Finish the current utterance early and send it. */
	const done = useCallback(() => {
		try {
			recRef.current?.stop();
		} catch {}
	}, []);

	const skip = useCallback(() => {
		stopSpeaking();
		nextRef.current();
	}, [stopSpeaking]);

	const toggleMute = useCallback(() => {
		const next = !mutedRef.current;
		mutedRef.current = next;
		setMuted(next);
		if (next && phaseRef.current === 'speaking') skip();
	}, [skip]);

	// Read new replies aloud as they arrive.
	useEffect(() => {
		const seen = seenRef.current;
		let added = false;
		for (const m of messages || []) {
			if (seen.has(m.id)) continue;
			seen.add(m.id);
			if (phaseRef.current === 'off' || !shouldSpeak(m, { selfId, since: sinceRef.current })) continue;
			queueRef.current.push({ text: spokenLine(m, latest.current.conversation), speaker: m.sender_id });
			added = true;
		}
		if (!added) return;
		const p = phaseRef.current;
		if (p === 'waiting' || p === 'paused') nextRef.current();
		// Listening but nothing said yet: stop and hear the reply first.
		else if (p === 'listening' && !heardRef.current && recRef.current && !recRef.current._heard) {
			stopListening();
			nextRef.current();
		}
	}, [messages, selfId, stopListening]);

	// A different chat, or leaving the page, ends voice mode.
	useEffect(() => stop, [conversation?.id, stop]);

	return { phase, stage, transcript, engine, muted, error, support, start, stop, talk, done, skip, toggleMute };
}
