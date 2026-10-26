import { describe, expect, it, vi } from 'vitest';
import {
	DICTATED,
	agentsIn,
	dictatedMessage,
	isIOS,
	isStopPhrase,
	nameHints,
	onDeviceRecognition,
	pickEngine,
	pickVoice,
	recognitionCtor,
	shouldSpeak,
	speakable,
	spokenLine,
	voiceSupport,
} from './voice-mode.js';

const agents = {
	id: 'g1',
	type: 'group',
	name: 'Agents',
	participants: [
		{ user_id: 'b', user: { username: 'riotcoder', account_type: 'agent' } },
		{ user_id: 'c', user: { username: 'cha0spunk', display_name: 'cha0spunk', account_type: 'agent' } },
		{ user_id: 'a', user: { username: 'chovy', account_type: 'user' } },
	],
};
const dm = { id: 'd1', type: 'direct', participants: agents.participants.filter((p) => p.user_id !== 'c') };

describe('voice support', () => {
	it('finds the prefixed recognition engine and needs both speech halves', () => {
		const W = function () {};
		expect(recognitionCtor({ webkitSpeechRecognition: W })).toBe(W);
		expect(recognitionCtor({})).toBeNull();
		expect(voiceSupport({ SpeechRecognition: W, speechSynthesis: {}, SpeechSynthesisUtterance: W })).toEqual({ listen: true, speak: true });
		expect(voiceSupport({ speechSynthesis: {} })).toEqual({ listen: false, speak: false });
	});

	it('uses on-device recognition only when the pack is installed, and fetches it otherwise', async () => {
		expect(await onDeviceRecognition(function () {}, 'en-US')).toBe(false);
		expect(await onDeviceRecognition({ available: async () => 'available' }, 'en-US')).toBe(true);
		const install = vi.fn(async () => true);
		expect(await onDeviceRecognition({ available: async () => 'downloadable', install }, 'en-US')).toBe(false);
		expect(install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
		expect(await onDeviceRecognition({ available: async () => { throw new TypeError('x'); } }, 'en-US')).toBe(false);
	});
});

describe('dictated messages', () => {
	it('carries the marker and is spoken without it', () => {
		expect(dictatedMessage('  deploy crawlproof ')).toBe(`${DICTATED} deploy crawlproof`);
		expect(speakable(dictatedMessage('hello'))).toBe('hello');
	});

	it('stops only on a whole stop phrase', () => {
		for (const t of ['stop', 'Stop.', 'stop listening', 'end voice mode', 'Goodbye!']) expect(isStopPhrase(t)).toBe(true);
		for (const t of ['stop the deploy', "don't stop", 'bye bye coinpay']) expect(isStopPhrase(t)).toBe(false);
	});
});

describe('speakable', () => {
	it('drops code, markdown and raw links', () => {
		const md = '## Done\n\n- merged **#322**\n- see https://github.com/profullstack/x/pull/322\n\n```sh\nbun test\n```\nRun `qc send` next.';
		expect(speakable(md)).toBe('Done. merged #322. see link to github.com. (code in the chat). Run qc send next.');
	});

	it('keeps link text, leaves snake_case alone and flattens tables', () => {
		expect(speakable('[the PR](https://x.dev/1) changed user_id_map')).toBe('the PR changed user_id_map');
		expect(speakable('| a | b |\n|---|---|\n| 1 | 2 |')).not.toMatch(/-{3}/);
	});

	it('cuts long replies at a sentence and points to the chat', () => {
		const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
		const out = speakable(long, 200);
		expect(out.length).toBeLessThan(260);
		expect(out).toMatch(/here\. The rest is in the chat\.$/);
	});
});

describe('what gets read aloud', () => {
	const since = Date.parse('2026-10-26T10:00:00Z');
	const msg = (o) => ({ id: 'm', sender_id: 'b', message_type: 'text', content: 'deployed', created_at: '2026-10-26T10:01:00Z', ...o });

	it('reads new text from others only', () => {
		expect(shouldSpeak(msg(), { selfId: 'a', since })).toBe(true);
		expect(shouldSpeak(msg({ sender_id: 'a' }), { selfId: 'a', since })).toBe(false);
		expect(shouldSpeak(msg({ created_at: '2026-10-26T09:59:00Z' }), { selfId: 'a', since })).toBe(false);
		for (const message_type of ['reaction', 'call', 'file']) expect(shouldSpeak(msg({ message_type }), { selfId: 'a', since })).toBe(false);
		expect(shouldSpeak(msg({ content: '🔒 Cannot decrypt' }), { selfId: 'a', since })).toBe(false);
		expect(shouldSpeak(msg({ content: '[Message content unavailable - please ask sender to resend]' }), { selfId: 'a', since })).toBe(false);
	});

	it('names the speaker in a group but not in a direct chat', () => {
		expect(spokenLine(msg({ sender_id: 'c' }), agents)).toBe('cha0spunk: deployed');
		expect(spokenLine(msg(), dm)).toBe('deployed');
	});

	it('lists the agents in a chat', () => {
		expect(agentsIn(agents, 'a').map((u) => u.username)).toEqual(['riotcoder', 'cha0spunk']);
		expect(agentsIn(undefined, 'a')).toEqual([]);
	});
});

describe('pickVoice', () => {
	const voices = [
		{ name: 'A', lang: 'en-US', localService: true },
		{ name: 'B', lang: 'en-GB', localService: true },
		{ name: 'C', lang: 'en-US', localService: false },
		{ name: 'D', lang: 'fr-FR', localService: true },
	];

	it('keeps one steady on-device voice per speaker in the page language', () => {
		const v = pickVoice(voices, 'en-US', 'riotcoder');
		expect(['A', 'B']).toContain(v.name);
		expect(pickVoice(voices, 'en-US', 'riotcoder')).toBe(v);
		expect(pickVoice(voices, 'fr-CA', 'x').name).toBe('D');
		expect(pickVoice(voices, 'ja-JP', 'x')).toBeNull();
	});
});

describe('engine choice', () => {
	const fn = function () {};
	const desktop = { navigator: { userAgent: 'Chrome', mediaDevices: { getUserMedia: fn } }, MediaRecorder: fn, AudioContext: fn };
	const iphone = { ...desktop, navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)', mediaDevices: { getUserMedia: fn } } };
	const ipad = { ...desktop, navigator: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5, mediaDevices: { getUserMedia: fn } } };

	it('uses the browser recognizer except on iOS, and records where there is none', () => {
		expect(pickEngine({ ...desktop, webkitSpeechRecognition: fn })).toBe('native');
		expect(pickEngine({ ...iphone, webkitSpeechRecognition: fn })).toBe('server');
		expect(pickEngine({ ...ipad, webkitSpeechRecognition: fn })).toBe('server');
		expect(pickEngine(desktop)).toBe('server');
		expect(pickEngine({ navigator: {} })).toBeNull();
		expect(isIOS(iphone)).toBe(true);
		expect(isIOS({ navigator: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 } })).toBe(false);
	});

	it('hints the names in the chat, not your own', () => {
		expect(nameHints(agents, 'a')).toEqual(['qrypt.chat', 'riotcoder', 'cha0spunk']);
	});
});

describe('iOS without a reachable microphone', () => {
	it('still offers voice so the tap can say what is wrong', () => {
		const iphoneNoMic = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' } };
		expect(pickEngine(iphoneNoMic)).toBe('server');
		expect(voiceSupport(iphoneNoMic).listen).toBe(true);
	});
});
