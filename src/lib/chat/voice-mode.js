/**
 * Voice mode: talk to a chat (usually your AI agents) instead of typing.
 *
 * Turn by turn, hands free: listen → send what you said → read the replies
 * aloud → listen again. Replies are read by the device (speechSynthesis).
 * Speech becomes text in the browser where it can (Web Speech API, on the
 * device when Chrome has the language pack, otherwise the vendor's service).
 * Where it cannot (iOS, Firefox) the clip is transcribed by qrypt.chat through
 * Workers AI and not stored. The voice bar says which. Messages are ML-KEM
 * encrypted like anything typed.
 *
 * Everything here is pure or takes the window/engine as an argument so it can
 * be tested without a browser.
 */

import { CALL_TYPE } from './calls.js';
import { REACTION_TYPE } from './reactions.js';
import { canRecord, isIOS } from './voice-recorder.js';

export { isIOS };

/** Marks a message as dictated, so agents know to answer in speakable prose. */
export const DICTATED = '🗣️';

export const dictatedMessage = (text) => `${DICTATED} ${String(text).trim()}`;

/** The SpeechRecognition constructor, or null (Firefox has none). */
export function recognitionCtor(win = globalThis) {
	return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

/**
 * How to turn speech into text here:
 *   'native'  the browser's SpeechRecognition
 *   'server'  record the clip and transcribe it on qrypt.chat (voice-recorder.js)
 * iOS always records: home-screen apps have no SpeechRecognition, Safari's
 * needs Siri on, and it goes deaf after audio plays (WebKit 321436).
 */
export function pickEngine(win = globalThis) {
	// On iOS always record: if the microphone is out of reach the recorder says exactly why.
	if (isIOS(win)) return 'server';
	if (recognitionCtor(win)) return 'native';
	if (canRecord(win)) return 'server';
	return null;
}

/** Native recognition errors that mean "this engine cannot work here", not "try again". */
export const NATIVE_UNUSABLE = ['service-not-allowed', 'network', 'language-not-supported'];

/** What this browser can do: listen (speech to text) and speak (text to speech). */
export function voiceSupport(win = globalThis) {
	return { listen: !!pickEngine(win), speak: !!win?.speechSynthesis && typeof win?.SpeechSynthesisUtterance === 'function' };
}

/** Names worth spelling right when transcribing: the people and agents in the chat. */
export function nameHints(conversation, selfId) {
	const names = new Set(['qrypt.chat']);
	for (const p of conversation?.participants || []) {
		if ((p.user_id ?? p.id) === selfId) continue;
		if (p.user?.username) names.add(p.user.username);
		if (p.user?.display_name) names.add(p.user.display_name);
	}
	return [...names];
}

/**
 * Whether recognition can run on this device for `lang`. Chrome 139+ exposes
 * SpeechRecognition.available()/install(); a downloadable pack is fetched in
 * the background for next time and this session uses the cloud engine.
 */
export async function onDeviceRecognition(Ctor, lang) {
	if (typeof Ctor?.available !== 'function') return false;
	const opts = { langs: [lang], processLocally: true };
	try {
		const status = await Ctor.available(opts);
		if (status === 'available') return true;
		if ((status === 'downloadable' || status === 'downloading') && typeof Ctor.install === 'function') {
			Ctor.install(opts).catch(() => {});
		}
	} catch {
		// Older builds throw on unknown options: fall back to the default engine.
	}
	return false;
}

/** Words that end voice mode when they are the whole utterance. */
export function isStopPhrase(text) {
	return /^(stop|stop listening|stop voice( mode)?|end voice( mode)?|exit voice( mode)?|voice off|goodbye|bye)[.!]?$/i.test(String(text).trim());
}

const hostOf = (url) => {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return 'a link';
	}
};

/**
 * Message text as it should be read aloud: no code, no markdown symbols, links
 * named by their site, and long replies cut at a sentence with a pointer to
 * the chat for the rest.
 */
export function speakable(text, max = 1200) {
	let s = String(text ?? '');
	if (s.startsWith(DICTATED)) s = s.slice(DICTATED.length);
	s = s
		.replace(/```[\s\S]*?(```|$)/g, ' (code in the chat) ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1')
		.replace(/https?:\/\/[^\s)>\]]+/g, (u) => `link to ${hostOf(u)}`)
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, '')
		.replace(/\|/g, ', ')
		.replace(/(\*\*|__|~~)(.+?)\1/g, '$2')
		.replace(/(^|\W)[*_](\S[^*_]*?)[*_](?=\W|$)/g, '$1$2')
		.replace(/\s*\n+\s*/g, '. ')
		.replace(/([.!?:;,])(?:\s*\.)+/g, '$1')
		.replace(/\s{2,}/g, ' ')
		.trim();
	if (s.length <= max) return s;
	const cut = s.slice(0, max);
	const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
	return `${end > max / 3 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, '…')} The rest is in the chat.`;
}

/**
 * Whether an incoming message should be read aloud: someone else's text that
 * arrived after voice mode started (reactions, calls and files are skipped).
 */
export function shouldSpeak(message, { selfId, since }) {
	if (!message || message.sender_id === selfId) return false;
	if ([REACTION_TYPE, CALL_TYPE, 'file', 'system'].includes(message.message_type)) return false;
	if (since && message.created_at && Date.parse(message.created_at) < since) return false;
	const text = String(message.content ?? '').trim();
	return !!text && !text.startsWith('🔒') && !/^\[(Message|No content)/.test(text);
}

/** The participant row for a user in a conversation, if loaded. */
export function participantOf(conversation, userId) {
	return (conversation?.participants || []).find((p) => (p.user_id ?? p.id) === userId)?.user || null;
}

/** The AI agents in a conversation. */
export function agentsIn(conversation, selfId) {
	return (conversation?.participants || [])
		.filter((p) => (p.user_id ?? p.id) !== selfId && p.user?.account_type === 'agent')
		.map((p) => p.user);
}

/** "riotcoder: …" in a group so you know who is talking; just the text in a direct chat. */
export function spokenLine(message, conversation) {
	const text = speakable(message.content);
	const others = (conversation?.participants || []).length;
	if (conversation?.type !== 'group' && others <= 2) return text;
	const who = message.sender || participantOf(conversation, message.sender_id);
	const name = who?.display_name || who?.username;
	return name ? `${name}: ${text}` : text;
}

const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7) >>> 0;

/**
 * A steady voice per speaker, so two agents in one group sound different.
 * Prefers voices for the page language that run on the device.
 */
export function pickVoice(voices, lang, speakerId) {
	const base = String(lang || 'en').toLowerCase().split('-')[0];
	const matching = (voices || []).filter((v) => String(v.lang).toLowerCase().startsWith(base));
	const local = matching.filter((v) => v.localService);
	const pool = local.length ? local : matching;
	if (!pool.length) return null;
	return pool[hash(speakerId) % pool.length];
}
