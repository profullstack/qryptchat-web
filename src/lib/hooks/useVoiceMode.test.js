import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceMode } from './useVoiceMode.js';

// The record-and-transcribe engine, scripted like FakeRecognition below.
const recorder = vi.hoisted(() => ({ last: null }));
vi.mock('@/lib/chat/voice-recorder.js', () => ({
	canRecord: () => true,
	micMissing: () => [],
	isIOS: (win = globalThis) => /iPhone|iPad|iPod/.test(win?.navigator?.userAgent || ''),
	setAudioSession: () => {},
	unlockAudio: () => {},
	RecorderRecognition: class {
		constructor() {
			recorder.last = this;
		}
		start() {}
		stop() {
			this.onend?.();
		}
		abort() {
			this.onend?.();
		}
		say(text) {
			const r = [{ transcript: text }];
			r.isFinal = true;
			this.onresult?.({ results: [r] });
			this.onend?.();
		}
	},
}));

/** A scriptable stand-in for the browser's SpeechRecognition. */
class FakeRecognition {
	static last = null;
	constructor() {
		FakeRecognition.last = this;
		this.started = false;
	}
	start() {
		this.started = true;
	}
	stop() {
		this.onend?.();
	}
	abort() {
		this.onerror?.({ error: 'aborted' });
		this.onend?.();
	}
	say(text) {
		const r = [{ transcript: text }];
		r.isFinal = true;
		this.onresult?.({ results: [r] });
		this.onend?.();
	}
	silence() {
		this.onerror?.({ error: 'no-speech' });
		this.onend?.();
	}
}

let spoken;
beforeEach(() => {
	spoken = [];
	FakeRecognition.last = null;
	recorder.last = null;
	window.SpeechRecognition = FakeRecognition;
	window.SpeechSynthesisUtterance = function (text) {
		this.text = text;
	};
	window.speechSynthesis = {
		speak: (u) => u.text && spoken.push(u),
		cancel: vi.fn(),
		getVoices: () => [],
	};
});
afterEach(() => {
	delete window.SpeechRecognition;
	delete window.SpeechSynthesisUtterance;
	delete window.speechSynthesis;
});

const conversation = {
	id: 'd1',
	type: 'direct',
	participants: [
		{ user_id: 'me', user: { username: 'chovy' } },
		{ user_id: 'bot', user: { username: 'riotcoder', account_type: 'agent' } },
	],
};

function setup() {
	const send = vi.fn(async () => ({ success: true }));
	const hook = renderHook((props) => useVoiceMode(props), {
		initialProps: { conversation, messages: [], selfId: 'me', send },
	});
	return { send, ...hook };
}

const reply = (id, content) => ({ id, sender_id: 'bot', message_type: 'text', content, created_at: new Date(Date.now() + 1000).toISOString() });

describe('useVoiceMode', () => {
	it('listens, sends what was said, reads the reply, then listens again', async () => {
		const { result, rerender, send } = setup();
		act(() => result.current.start());
		expect(result.current.phase).toBe('listening');

		await act(async () => FakeRecognition.last.say('ship the release'));
		expect(send).toHaveBeenCalledWith('🗣️ ship the release');
		expect(result.current.phase).toBe('waiting');

		await act(async () => rerender({ conversation, messages: [reply('r1', 'Released **0.11.0**.')], selfId: 'me', send }));
		expect(result.current.phase).toBe('speaking');
		expect(spoken.map((u) => u.text)).toEqual(['Released 0.11.0.']);

		const before = FakeRecognition.last;
		await act(async () => spoken.at(-1).onend());
		expect(result.current.phase).toBe('listening');
		expect(FakeRecognition.last).not.toBe(before);
	});

	it('stops on "stop" and pauses after repeated silence', async () => {
		const { result } = setup();
		act(() => result.current.start());
		for (let i = 0; i < 3; i++) await act(async () => FakeRecognition.last.silence());
		expect(result.current.phase).toBe('paused');

		act(() => result.current.talk());
		await act(async () => FakeRecognition.last.say('stop'));
		expect(result.current.phase).toBe('off');
	});

	it('does not read old messages or speak while muted', async () => {
		const { result, rerender, send } = setup();
		const old = { ...reply('old', 'old news'), created_at: '2020-01-01T00:00:00Z' };
		act(() => result.current.toggleMute());
		act(() => result.current.start());
		await act(async () => FakeRecognition.last.say('status'));
		await act(async () => rerender({ conversation, messages: [old, reply('r2', 'all green')], selfId: 'me', send }));
		expect(spoken).toEqual([]);
		expect(result.current.phase).toBe('listening');
	});

	it('hears a reply that lands while listening before anything is said', async () => {
		const { result, rerender, send } = setup();
		act(() => result.current.start());
		await act(async () => rerender({ conversation, messages: [reply('r3', 'on it')], selfId: 'me', send }));
		expect(result.current.phase).toBe('speaking');
		expect(spoken.map((u) => u.text)).toEqual(['on it']);
	});

	it('switches to recording when the browser refuses its recognizer (Siri off, iOS web app)', async () => {
		const { result, send } = setup();
		act(() => result.current.start());
		expect(result.current.engine).toBe('browser');
		await act(async () => {
			FakeRecognition.last.onerror({ error: 'service-not-allowed' });
			FakeRecognition.last.onend();
		});
		expect(result.current.engine).toBe('server');
		expect(result.current.phase).toBe('listening');
		expect(result.current.error).toBe('');
		await act(async () => recorder.last.say('check the inbox'));
		expect(send).toHaveBeenCalledWith('🗣️ check the inbox');
	});

	it('records on iOS even where SpeechRecognition exists, and names the chat for the transcriber', async () => {
		const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)');
		try {
			const { result } = setup();
			act(() => result.current.start());
			expect(result.current.engine).toBe('server');
			expect(FakeRecognition.last).toBeNull();
			expect(recorder.last.hints).toEqual(['qrypt.chat', 'riotcoder']);
		} finally {
			ua.mockRestore();
		}
	});
});
