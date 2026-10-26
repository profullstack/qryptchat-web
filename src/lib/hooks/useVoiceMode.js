'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	dictatedMessage,
	isStopPhrase,
	onDeviceRecognition,
	pickVoice,
	recognitionCtor,
	shouldSpeak,
	spokenLine,
	voiceSupport,
} from '@/lib/chat/voice-mode.js';

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

/**
 * Hands-free voice conversation with a chat.
 *
 * phase: off | listening | waiting (sent, waiting for a reply) | speaking | paused (tap to talk)
 */
export function useVoiceMode({ conversation, messages, selfId, send }) {
	const [phase, setPhase] = useState('off');
	const [transcript, setTranscript] = useState('');
	const [onDevice, setOnDevice] = useState(null);
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
	const onDeviceRef = useRef(false);
	const latest = useRef({ conversation, send });
	latest.current = { conversation, send };

	useEffect(() => setSupport(voiceSupport(window)), []);

	const lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

	const go = useCallback((p) => {
		phaseRef.current = p;
		setPhase(p);
	}, []);

	const stopListening = useCallback(() => {
		const rec = recRef.current;
		recRef.current = null;
		if (rec) {
			rec.onresult = rec.onerror = rec.onend = null;
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
		const token = ++speakTokenRef.current;
		const voice = pickVoice(synth.getVoices(), lang, item.speaker);
		const parts = chunks(item.text);
		parts.forEach((part, i) => {
			const u = new SpeechSynthesisUtterance(part);
			u.lang = voice?.lang || lang;
			if (voice) u.voice = voice;
			if (i === parts.length - 1) {
				u.onend = u.onerror = () => {
					if (token === speakTokenRef.current) nextRef.current();
				};
			}
			synth.speak(u);
		});
	};

	listenRef.current = () => {
		if (phaseRef.current === 'off') return;
		const Ctor = recognitionCtor(window);
		if (!Ctor) {
			setError('This browser cannot listen. Try Chrome, Edge or Safari.');
			return go('paused');
		}
		stopListening();
		heardRef.current = '';
		setTranscript('');
		const rec = new Ctor();
		rec.lang = lang;
		rec.interimResults = true;
		rec.continuous = false;
		rec.maxAlternatives = 1;
		if (onDeviceRef.current) rec.processLocally = true;
		let noSpeech = false;
		let blocked = false;
		rec.onresult = (e) => {
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
			else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
				setError('Microphone access is blocked. Allow it for qrypt.chat in your browser settings.');
				blocked = true;
			} else if (e.error !== 'aborted') setError(`Speech recognition: ${e.error}`);
		};
		rec.onend = () => {
			if (recRef.current !== rec) return;
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
			if (queueRef.current.length) return nextRef.current();
			if (noSpeech && ++silentRef.current < MAX_SILENT_TURNS) return listenRef.current();
			go('paused');
		};
		recRef.current = rec;
		go('listening');
		try {
			rec.start();
		} catch (err) {
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
		setPhase('off');
	}, [stopListening, stopSpeaking]);

	/** Turn voice mode on. Must run from a tap: browsers only unlock audio and the mic on a user gesture. */
	const start = useCallback(() => {
		setError('');
		silentRef.current = 0;
		queueRef.current = [];
		sinceRef.current = Date.now();
		seenRef.current = new Set((messages || []).map((m) => m.id));
		// iOS only lets speech play later if something was spoken during the tap.
		try {
			const synth = window.speechSynthesis;
			synth?.cancel();
			synth?.speak(new SpeechSynthesisUtterance(''));
		} catch {}
		phaseRef.current = 'starting';
		const Ctor = recognitionCtor(window);
		onDeviceRecognition(Ctor, lang).then((local) => {
			onDeviceRef.current = local;
			setOnDevice(local);
		});
		listenRef.current();
	}, [messages, lang]);

	/** Tap to talk: interrupts whatever is being read and listens now. */
	const talk = useCallback(() => {
		if (phaseRef.current === 'off') return start();
		setError('');
		silentRef.current = 0;
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
		else if (p === 'listening' && !heardRef.current && recRef.current) {
			stopListening();
			nextRef.current();
		}
	}, [messages, selfId, stopListening]);

	// A different chat, or leaving the page, ends voice mode.
	useEffect(() => stop, [conversation?.id, stop]);

	return { phase, transcript, onDevice, muted, error, support, start, stop, talk, done, skip, toggleMute };
}
