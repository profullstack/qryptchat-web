/**
 * Speech to text for voice mode where the browser cannot do it itself (iOS
 * home-screen apps have no SpeechRecognition; Firefox has none at all).
 *
 * The clip is passed straight to Cloudflare Workers AI Whisper and the text
 * comes back; nothing is written to disk or logged. Env:
 *   CF_AI_ACCOUNT_ID, CF_AI_TOKEN   a token with Workers AI permission only
 *   VOICE_STT_MODEL                 default @cf/openai/whisper-large-v3-turbo
 */

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const DEFAULT_MODEL = '@cf/openai/whisper-large-v3-turbo';

export class TranscribeError extends Error {
	constructor(message, status = 500) {
		super(message);
		this.status = status;
	}
}

/** True when the server has speech-to-text credentials. */
export const transcribeConfigured = (env = process.env) => !!(env.CF_AI_ACCOUNT_ID && env.CF_AI_TOKEN);

/** Browser recorders produce webm/ogg (Chrome, Firefox) or mp4 (Safari, iOS). */
export function isAudioType(type) {
	return /^(audio|video)\/(webm|ogg|mp4|mpeg|mp3|x-m4a|m4a|aac|wav|x-wav)(;.*)?$/i.test(String(type || '').trim());
}

/**
 * Names Whisper should spell right (agents, people in the chat), from the
 * client's URI-encoded hint header. Letters, digits and a little punctuation.
 */
export function cleanHint(raw, max = 300) {
	let s = '';
	try {
		s = decodeURIComponent(String(raw || ''));
	} catch {
		return '';
	}
	return s
		.split(',')
		.map((w) => w.replace(/[^\p{L}\p{N} ._'-]/gu, '').trim())
		.filter(Boolean)
		.join(', ')
		.slice(0, max);
}

/** Whisper's stock output for silence or noise: never send these as messages. */
const PHANTOMS = new Set([
	'', 'you', 'thank you', 'thanks', 'thank you very much', 'thanks for watching', 'thank you for watching',
	'bye', 'okay', 'so', 'uh', 'um', 'hmm', 'subtitles by the amaraorg community',
]);

export function cleanTranscript(text) {
	const t = String(text || '').replace(/\s+/g, ' ').trim();
	const key = t.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
	return PHANTOMS.has(key) ? '' : t;
}

/** Transcribe one clip. Returns the text, '' when nothing was said. */
export async function transcribe(audio, { lang = '', hint = '', env = process.env, fetchImpl = fetch } = {}) {
	if (!transcribeConfigured(env)) throw new TranscribeError('Voice transcription is not configured', 503);
	const bytes = audio instanceof Uint8Array ? audio : new Uint8Array(audio);
	if (!bytes.length) return '';
	if (bytes.length > MAX_AUDIO_BYTES) throw new TranscribeError('Recording too long', 413);

	const body = { audio: Buffer.from(bytes).toString('base64') };
	const language = String(lang).toLowerCase().split(/[-_]/)[0];
	if (/^[a-z]{2}$/.test(language)) body.language = language;
	if (hint) body.initial_prompt = `Names: ${hint}.`;

	const model = env.VOICE_STT_MODEL || DEFAULT_MODEL;
	const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CF_AI_ACCOUNT_ID}/ai/run/${model}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.CF_AI_TOKEN}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const data = await res.json().catch(() => null);
	if (!res.ok || !data?.success) {
		const msg = data?.errors?.[0]?.message || `HTTP ${res.status}`;
		throw new TranscribeError(`Transcription failed: ${msg}`, 502);
	}
	return cleanTranscript(data.result?.text);
}
