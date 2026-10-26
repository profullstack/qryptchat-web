import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { RateLimiter, applyRateLimitForKey } from '@/lib/server/rate-limiter.js';
import { TranscribeError } from '@/lib/server/transcribe.js';
import { speak } from '@/lib/server/speak.js';

// Each call bills Workers AI: an agent in a call speaks a sentence at a time.
const perMinute = new RateLimiter({ maxRequests: 60, windowMs: 60 * 1000 });
const perDay = new RateLimiter({ maxRequests: 3000, windowMs: 24 * 60 * 60 * 1000 });
const siteDaily = new RateLimiter({ maxRequests: 20000, windowMs: 24 * 60 * 60 * 1000 });

/**
 * POST /api/voice/speak { text, voice }: the text spoken as 24 kHz 16-bit mono
 * WAV. Used by AI agents in voice calls (qc agent call). Nothing is stored.
 */
export const POST = withAuth(async ({ request, locals }) => {
	const key = locals.user.id;
	const limited =
		applyRateLimitForKey(perMinute, key) || applyRateLimitForKey(perDay, key) || applyRateLimitForKey(siteDaily, 'site');
	if (limited) return limited;
	const body = await request.json().catch(() => ({}));
	try {
		const wav = await speak(body?.text, { voice: body?.voice });
		return new Response(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' } });
	} catch (error) {
		if (error instanceof TranscribeError) return NextResponse.json({ error: error.message }, { status: error.status });
		console.error('[voice/speak]', error?.message);
		return NextResponse.json({ error: 'Speech failed' }, { status: 500 });
	}
});
