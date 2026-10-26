/**
 * `qc agent call`: an AI agent that takes part in qrypt.chat voice calls.
 *
 * When someone starts a call in one of the agent's chats, the agent joins it
 * like any participant: the call's media key arrives in the ML-KEM-encrypted
 * 'call' message, so every frame stays end-to-end encrypted (LiveKit E2EE,
 * HKDF from the shared key, exactly as @profullstack/pairux-embed does in the
 * browser). It listens to the people in the call, finds the end of each thing
 * said, has it transcribed (POST /api/voice/transcribe), asks its brain what
 * to answer, and speaks the answer (POST /api/voice/speak) sentence by
 * sentence. Talking over it stops it, like a person. Its own text messages
 * posted during the call (a finished task, say) are read out too.
 *
 * The brain is any command (--brain "cmd"): it gets one JSON object on stdin
 *   { agent, conversationId, title, speaker, speakerId, text, at, transcript: [{ who, text }] }
 * and prints PASS (say nothing) or SAY: <what to say>. It may post to the chat
 * itself; with --post the agent posts what it says as "🔊 …".
 *
 * Needs @livekit/rtc-node (npm i -g @livekit/rtc-node), loaded only here.
 */

import { spawn } from 'node:child_process';
import { CALL_TYPE, parseCall } from '../lib/chat/calls.js';
import { speakable } from '../lib/chat/voice-mode.js';
import { createEndpointer, encodeWav } from '../lib/chat/voice-recorder.js';

/** What qrypt's browsers do: ExternalE2EEKeyProvider.setKey(bytes) derives with HKDF. */
const HKDF = 1;
export const e2eeOptions = (key) => ({
	keyProviderOptions: {
		sharedKey: new Uint8Array(key),
		ratchetSalt: new TextEncoder().encode('LKFrameEncryptionKey'),
		ratchetWindowSize: 16,
		failureTolerance: -1,
		keyRingSize: 16,
		keyDerivationFunction: HKDF,
	},
});

export const JOIN_RECENT_MS = 30 * 60 * 1000; // on start-up, join calls started this recently
const ALONE_LEAVE_MS = 30 * 1000; // leave once no person has been in the call this long
const MAX_CALL_MS = 3 * 60 * 60 * 1000;
const RATE = 16000; // what we listen at
const SPEAK_RATE = 24000; // what /api/voice/speak returns
export const SPOKEN_PREFIX = '🔊';

/** The qrypt user id in a partner room identity (`<partner>:<user id>`). */
export const userIdOf = (identity) => String(identity || '').split(':').pop();

/** Sentences of at most `max` characters, for speaking one at a time. */
export function splitSentences(text, max = 300) {
	const out = [];
	let cur = '';
	for (const s of String(text).match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || []) {
		if (cur && (cur + s).length > max) {
			out.push(cur.trim());
			cur = '';
		}
		cur += s;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

/** PASS | SAY: text (anything else counts as PASS). */
export function parseBrain(out) {
	const s = String(out || '');
	const i = s.search(/^\s*SAY:/m);
	return i < 0 ? '' : s.slice(i).replace(/^\s*SAY:\s*/, '').trim();
}

/** Int16 samples of a 16-bit PCM WAV (finds the data chunk). */
export function wavSamples(bytes) {
	const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	let o = 12;
	while (o + 8 <= b.length) {
		const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
		let size = v.getUint32(o + 4, true);
		if (id === 'data') {
			// Streamed WAVs may say 0 or 0xffffffff: take what is there.
			if (!size || size === 0xffffffff || o + 8 + size > b.length) size = b.length - o - 8;
			const n = Math.floor(size / 2);
			const out = new Int16Array(n);
			for (let i = 0; i < n; i++) out[i] = v.getInt16(o + 8 + i * 2, true);
			return out;
		}
		o += 8 + size + (size % 2);
	}
	return new Int16Array(0);
}

const rmsOf = (int16) => {
	let s = 0;
	for (let i = 0; i < int16.length; i++) s += (int16[i] / 32768) ** 2;
	return Math.sqrt(s / Math.max(1, int16.length));
};

/** Ask the brain command; resolves to what to say ('' = nothing). */
export function askBrain(cmd, input, { timeoutMs = 90_000, env = process.env } = {}) {
	return new Promise((resolve) => {
		const child = spawn(cmd, { shell: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('error', (e) => {
			clearTimeout(timer);
			resolve({ say: '', error: e.message });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ say: parseBrain(out), error: code ? `brain exited ${code}: ${err.trim().slice(-200)}` : '' });
		});
		child.stdin.end(JSON.stringify(input));
	});
}

/** One call the agent is in. */
export class CallSession {
	constructor({ client, rtc, conversation, call, brain, voice, post, log, isHuman }) {
		Object.assign(this, { client, rtc, conversation, call, brain, voice, post, log, isHuman });
		this.transcript = [];
		this.queue = Promise.resolve();
		this.speakToken = 0;
		this.speaking = false;
		this.closed = false;
		this.started = Date.now();
		this.lastHuman = Date.now();
	}

	get id() {
		return this.conversation.id;
	}

	async join({ greet = true } = {}) {
		const { Room, RoomEvent, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource, TrackKind } = this.rtc;
		const { token, url } = await this.client.request('/api/calls/token', { method: 'POST', body: { conversationId: this.id } });
		const room = new Room();
		this.room = room;
		room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
			if (track.kind === TrackKind.KIND_AUDIO && this.isHuman(userIdOf(participant.identity))) this.listen(track, participant);
		});
		room.on(RoomEvent.Disconnected, () => this.close('disconnected'));
		await room.connect(url, token, { autoSubscribe: true, e2ee: e2eeOptions(this.call.key) });
		this.source = new AudioSource(SPEAK_RATE, 1);
		const track = LocalAudioTrack.createAudioTrack(`${this.client.me?.username || 'agent'}-voice`, this.source);
		const opts = new TrackPublishOptions();
		opts.source = TrackSource.SOURCE_MICROPHONE;
		await room.localParticipant.publishTrack(track, opts);
		this.log(`joined the call in ${this.conversation.title}`);
		this.watchdog = setInterval(() => this.checkAlone(), 5000);
		if (greet) this.say(`${this.client.me?.display_name || this.client.me?.username || 'Agent'} here.`);
	}

	humansPresent() {
		return [...(this.room?.remoteParticipants?.values() ?? [])].some((p) => this.isHuman(userIdOf(p.identity)));
	}

	checkAlone() {
		if (this.humansPresent()) this.lastHuman = Date.now();
		if (Date.now() - this.lastHuman > ALONE_LEAVE_MS) return this.close('everyone left');
		if (Date.now() - this.started > MAX_CALL_MS) return this.close('call too long');
	}

	/** Hear one person: find each utterance and handle it. */
	async listen(track, participant) {
		const { AudioStream } = this.rtc;
		const name = participant.name || 'someone';
		const speakerId = userIdOf(participant.identity);
		const stream = new AudioStream(track, { sampleRate: RATE, numChannels: 1 });
		let ep = createEndpointer({ stepMs: 10, silenceMs: 900, noSpeechMs: Infinity, maxMs: 30_000 });
		let frames = [];
		try {
			for await (const frame of stream) {
				if (this.closed) break;
				const pcm = Int16Array.from(frame.data);
				frames.push(pcm);
				const ev = ep.push(rmsOf(pcm));
				if (!ep.spoke && frames.length > 50) frames = frames.slice(-50); // keep 0.5 s before speech
				if (ev === 'speech-start') this.bargeIn();
				if (ev === 'end' || ev === 'max') {
					const all = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
					let o = 0;
					for (const f of frames) for (let i = 0; i < f.length; i++) all[o++] = f[i] / 32768;
					frames = [];
					ep = createEndpointer({ stepMs: 10, silenceMs: 900, noSpeechMs: Infinity, maxMs: 30_000 });
					this.enqueue(() => this.heard(all, name, speakerId));
				}
			}
		} catch (e) {
			if (!this.closed) this.log(`listening to ${name} stopped: ${e.message}`);
		}
	}

	enqueue(job) {
		this.queue = this.queue.then(job).catch((e) => this.log(`error: ${e.message}`));
		return this.queue;
	}

	/** Someone finished saying something: transcribe, think, answer. */
	async heard(samples, name, speakerId) {
		const wav = encodeWav(samples, RATE);
		const res = await this.client.fetch(`${this.client.base}/api/voice/transcribe`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${await this.client.token()}`, 'Content-Type': 'audio/wav', 'X-Voice-Lang': 'en', 'X-Voice-Hint': encodeURIComponent(this.hints().join(',')) },
			body: wav,
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(`transcribe ${res.status}: ${data.error || ''}`);
		const text = String(data.text || '').trim();
		if (!text) return;
		this.log(`${name}: ${text}`);
		this.transcript.push({ who: name, text });
		const { say, error } = await askBrain(this.brain, {
			agent: this.client.me?.username,
			conversationId: this.id,
			title: this.conversation.title,
			speaker: name,
			speakerId,
			text,
			at: new Date().toISOString(),
			transcript: this.transcript.slice(-30),
		});
		if (error) this.log(error);
		if (!say) return;
		this.transcript.push({ who: `${this.client.me?.username} (you)`, text: say });
		if (this.post) this.client.send(this.id, `${SPOKEN_PREFIX} ${say}`).catch((e) => this.log(`post failed: ${e.message}`));
		await this.say(say);
	}

	hints() {
		return [...new Set((this.conversation.participants || []).flatMap((p) => [p.user?.username, p.user?.display_name]).filter(Boolean))];
	}

	/** Speak, one sentence at a time, fetching the next while this one plays. */
	async say(text) {
		const clean = speakable(text, 1500);
		if (!clean || !this.source) return;
		const token = ++this.speakToken;
		// Short chunks: the first is spoken as soon as it is ready, the next fetched while it plays.
		const sentences = splitSentences(clean, 120);
		let next = this.tts(sentences[0]);
		this.speaking = true;
		try {
			for (let i = 0; i < sentences.length; i++) {
				const pcm = await next;
				if (i + 1 < sentences.length) next = this.tts(sentences[i + 1]);
				if (token !== this.speakToken || this.closed) return;
				const { AudioFrame } = this.rtc;
				const step = SPEAK_RATE / 100;
				for (let o = 0; o + step <= pcm.length; o += step) {
					if (token !== this.speakToken || this.closed) return;
					await this.source.captureFrame(new AudioFrame(pcm.slice(o, o + step), SPEAK_RATE, 1, step));
				}
			}
			await this.source.waitForPlayout?.();
		} finally {
			if (token === this.speakToken) this.speaking = false;
		}
	}

	async tts(sentence) {
		const res = await this.client.fetch(`${this.client.base}/api/voice/speak`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${await this.client.token()}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ text: sentence, voice: this.voice }),
		});
		if (!res.ok) throw new Error(`speak ${res.status}: ${(await res.json().catch(() => ({}))).error || ''}`);
		return wavSamples(new Uint8Array(await res.arrayBuffer()));
	}

	/** A person started talking: stop talking over them. */
	bargeIn() {
		if (!this.speaking) return;
		this.speakToken++;
		this.speaking = false;
		this.source?.clearQueue();
	}

	async close(why) {
		if (this.closed) return;
		this.closed = true;
		clearInterval(this.watchdog);
		this.speakToken++;
		this.log(`left the call in ${this.conversation.title} (${why})`);
		await this.room?.disconnect().catch(() => {});
		this.onClose?.();
	}
}

async function loadRtc() {
	try {
		// A variable so bundlers and test runners leave it for runtime: it is an optional peer.
		const name = '@livekit/rtc-node';
		return await import(/* @vite-ignore */ name);
	} catch {
		throw new Error('qc agent call needs @livekit/rtc-node: npm i -g @livekit/rtc-node (or install it next to qc).');
	}
}

/** The most recent call message in a chat, decrypted, if any. */
async function latestCall(client, conversationId) {
	const { messages = [] } = await client.request('/api/messages/load', { method: 'POST', body: { conversationId, limit: 20 } });
	for (const m of [...messages].reverse()) {
		if (m.message_type !== CALL_TYPE || !m.encrypted_content) continue;
		const call = parseCall(await client.ring.decrypt(m.encrypted_content));
		if (call) return { ...call, messageId: m.id, at: call.at || m.created_at, senderId: m.sender_id };
	}
	return null;
}

/**
 * Run the agent: join calls in its chats as they start, until stopped.
 * `rtc` and `onSession` are for tests.
 */
export async function runVoiceAgent(client, { brain, voice = 'orion', post = false, greet = true, hearAgents = false, log = (s) => process.stderr.write(`qc agent call: ${s}\n`), rtc, signal } = {}) {
	if (!brain) throw new Error('Usage: qc agent call --brain "<command>" [--voice orion] [--post] [--no-greet]');
	rtc ??= await loadRtc();
	const sessions = new Map();
	let chats = new Map();
	const loadChats = async () => {
		chats = new Map((await client.conversations()).map((c) => [c.id, c]));
		return chats;
	};
	const agentIds = () => new Set([...chats.values()].flatMap((c) => (c.participants || []).filter((p) => p.user?.account_type === 'agent').map((p) => p.user_id ?? p.user?.id)));
	// Other agents are not listened to (two agents would answer each other forever), unless asked (tests).
	const isHuman = (userId) => userId !== client.me?.id && (hearAgents || !agentIds().has(userId));

	const join = async (conversation, call) => {
		if (sessions.has(conversation.id) || Date.now() - Date.parse(call.at) > MAX_CALL_MS) return;
		const session = new CallSession({ client, rtc, conversation, call, brain, voice, post, log, isHuman });
		sessions.set(conversation.id, session);
		session.onClose = () => sessions.delete(conversation.id);
		try {
			await session.join({ greet });
		} catch (e) {
			log(`could not join the call in ${conversation.title}: ${e.message}`);
			await session.close('join failed');
		}
	};

	await loadChats();
	for (const c of chats.values()) {
		const call = await latestCall(client, c.id).catch(() => null);
		if (call && Date.now() - Date.parse(call.at) < JOIN_RECENT_MS) await join(c, call);
	}
	log(`listening for calls in ${chats.size} chat(s)`);

	await client.events(
		async ({ type, data }) => {
			const m = data?.message;
			if (type !== 'NEW_MESSAGE' || !m?.conversation_id) return;
			if (!chats.has(m.conversation_id)) await loadChats();
			const conversation = chats.get(m.conversation_id);
			if (!conversation) return;
			if (m.message_type === CALL_TYPE) {
				const call = await latestCall(client, conversation.id);
				if (call && call.messageId === m.id) {
					await sessions.get(conversation.id)?.close('a new call started');
					await join(conversation, call);
				}
				return;
			}
			// Our own text posted during a call (a task finishing): read it out.
			const session = sessions.get(conversation.id);
			if (session && m.sender_id === client.me?.id && (m.message_type ?? 'text') === 'text') {
				const { messages = [] } = await client.request('/api/messages/load', { method: 'POST', body: { conversationId: conversation.id, limit: 5 } });
				const raw = messages.find((x) => x.id === m.id);
				const text = raw?.encrypted_content ? await client.ring.decrypt(raw.encrypted_content) : '';
				if (text && !text.startsWith(SPOKEN_PREFIX) && !text.startsWith('🗣️')) session.enqueue(() => session.say(text));
			}
		},
		{ signal, onStatus: (s) => log(`events ${s}`) },
	);
	for (const s of sessions.values()) await s.close('stopped');
}
