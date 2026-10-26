import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { RateLimiter, applyRateLimitForKey } from '@/lib/server/rate-limiter.js';
import { MAX_AUDIO_BYTES, TranscribeError, cleanHint, isAudioType, transcribe, transcribeConfigured } from '@/lib/server/transcribe.js';

// Each call bills Workers AI, so cap it per person and across the site.
const perMinute = new RateLimiter({ maxRequests: 30, windowMs: 60 * 1000 });
const perDay = new RateLimiter({ maxRequests: 1000, windowMs: 24 * 60 * 60 * 1000 });
const siteDaily = new RateLimiter({ maxRequests: 10000, windowMs: 24 * 60 * 60 * 1000 });

/** GET /api/voice/transcribe: whether server transcription is available. */
export const GET = withAuth(async () => NextResponse.json({ available: transcribeConfigured() }));

/**
 * POST /api/voice/transcribe   body: the recorded clip (audio/webm, audio/mp4, …)
 * Headers: X-Voice-Lang (BCP 47), X-Voice-Hint (URI-encoded, comma-separated names).
 * Returns { text } ('' when nothing was said). The audio is never stored.
 */
export const POST = withAuth(async ({ request, locals }) => {
	const key = locals.user.id;
	const limited =
		applyRateLimitForKey(perMinute, key) || applyRateLimitForKey(perDay, key) || applyRateLimitForKey(siteDaily, 'site');
	if (limited) return limited;

	const type = request.headers.get('content-type');
	if (!isAudioType(type)) return NextResponse.json({ error: 'Send the recording as audio/*' }, { status: 415 });
	if (Number(request.headers.get('content-length') || 0) > MAX_AUDIO_BYTES) {
		return NextResponse.json({ error: 'Recording too long' }, { status: 413 });
	}

	try {
		const audio = new Uint8Array(await request.arrayBuffer());
		const text = await transcribe(audio, {
			lang: request.headers.get('x-voice-lang') || '',
			hint: cleanHint(request.headers.get('x-voice-hint')),
		});
		return NextResponse.json({ text });
	} catch (error) {
		if (error instanceof TranscribeError) return NextResponse.json({ error: error.message }, { status: error.status });
		console.error('[voice/transcribe]', error?.message);
		return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
	}
});
