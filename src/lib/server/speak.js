/**
 * Text to speech for AI agents in voice calls (qc agent call).
 *
 * Cloudflare Workers AI Deepgram Aura 2 returns 24 kHz 16-bit mono WAV, which
 * the agent feeds straight into the call. The text is spoken and dropped;
 * nothing is stored. Env as for transcription (src/lib/server/transcribe.js):
 *   CF_AI_ACCOUNT_ID, CF_AI_TOKEN   VOICE_TTS_MODEL (default @cf/deepgram/aura-2-en)
 */

import { TranscribeError, transcribeConfigured } from './transcribe.js';

export const MAX_SPEAK_CHARS = 1000;
const DEFAULT_MODEL = '@cf/deepgram/aura-2-en';

/** Aura 2 English voices an agent may pick (Deepgram speaker names). */
export const VOICES = [
	'orion', 'luna', 'asteria', 'arcas', 'athena', 'helios', 'hera', 'orpheus', 'stella', 'zeus', 'thalia', 'apollo',
	'aries', 'atlas', 'aurora', 'callista', 'cora', 'cordelia', 'delia', 'draco', 'electra', 'harmonia', 'hermes',
	'hyperion', 'iris', 'janus', 'juno', 'jupiter', 'mars', 'minerva', 'neptune', 'odysseus', 'ophelia', 'pandora',
	'phoebe', 'pluto', 'saturn', 'selene', 'theia', 'vesta',
];

export const speakConfigured = transcribeConfigured;

/** The voice to use: a known Aura voice, else orion. */
export const pickSpeaker = (voice) => (VOICES.includes(String(voice || '').toLowerCase()) ? String(voice).toLowerCase() : 'orion');

/** Speak `text`; resolves to WAV bytes (24 kHz, 16-bit, mono). */
export async function speak(text, { voice, env = process.env, fetchImpl = fetch } = {}) {
	if (!speakConfigured(env)) throw new TranscribeError('Voice is not configured', 503);
	const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
	if (!clean) throw new TranscribeError('Nothing to say', 400);
	if (clean.length > MAX_SPEAK_CHARS) throw new TranscribeError('Text too long', 413);
	const model = env.VOICE_TTS_MODEL || DEFAULT_MODEL;
	const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CF_AI_ACCOUNT_ID}/ai/run/${model}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: clean, speaker: pickSpeaker(voice), encoding: 'linear16', container: 'wav', sample_rate: 24000 }),
	});
	const bytes = new Uint8Array(await res.arrayBuffer());
	// Errors come back as JSON; audio as a RIFF file (whatever the content-type says).
	const isWav = bytes.length > 44 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF';
	if (!res.ok || !isWav) {
		let msg = `HTTP ${res.status}`;
		try {
			msg = JSON.parse(new TextDecoder().decode(bytes))?.errors?.[0]?.message || msg;
		} catch {}
		throw new TranscribeError(`Speech failed: ${msg}`, 502);
	}
	return bytes;
}
