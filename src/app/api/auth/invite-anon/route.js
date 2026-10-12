/**
 * @fileoverview API endpoint that lets a signed-in account mint a single-use
 * anonymous invite for someone else. Mirrors AgentBBS's issuer role, but the
 * issuer is the web app itself (`qryptchat-web`). There is no per-account limit.
 *
 * Auth: `Authorization: Bearer <supabase access_token>` (anonymous or verified).
 * The minted token is redeemed at /anon?invite=... via /api/auth/register-anon.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { getAppOrigin } from '@/lib/auth/coinpay.js';
import { mintInviteToken } from '@/lib/invites/mint.js';

/** Issuer id registered in `invite_issuers` for the web app. */
const WEB_ISSUER_ID = 'qryptchat-web';

/**
 * Build a service-role Supabase client (bypasses RLS).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createServiceClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

/**
 * GET /api/auth/invite-anon — report how many invites the caller has minted.
 * Invites are unlimited, so `remaining` and `quota` are null.
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const auth = await authenticate(request);
	if (auth.error) return auth.error;
	const { serviceSupabase, authUser } = auth;

	const { used, quotaError } = await getQuota(serviceSupabase, authUser.id);
	if (quotaError) {
		console.error('invite-anon: failed to verify invite quota', quotaError);
		return NextResponse.json({ error: 'Failed to verify invite quota' }, { status: 500 });
	}
	return NextResponse.json({ remaining: null, quota: null, used });
}

/**
 * POST /api/auth/invite-anon — mint a single-use anonymous invite link.
 *
 * Body (optional): { ttlSeconds?: number }
 * Returns: { success, token, url, remaining }
 *
 * @param {import('next/server').NextRequest} request
 */
export async function POST(request) {
	try {
		const seed = process.env.QRYPT_WEB_ISSUER_SEED;
		if (!seed) {
			console.error('invite-anon: QRYPT_WEB_ISSUER_SEED is not configured');
			return NextResponse.json(
				{ error: 'Anonymous invites are not configured on this server' },
				{ status: 503 }
			);
		}

		const auth = await authenticate(request);
		if (auth.error) return auth.error;
		const { serviceSupabase, authUser } = auth;

		// --- Require a registered account (users row) to mint invites ---
		const { data: inviter } = await serviceSupabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUser.id)
			.single();
		if (!inviter) {
			return NextResponse.json({ error: 'Complete registration before inviting' }, { status: 403 });
		}

		// --- The issuer can still be switched off as a kill switch ---
		const { data: issuer } = await serviceSupabase
			.from('invite_issuers')
			.select('disabled')
			.eq('id', WEB_ISSUER_ID)
			.single();
		if (issuer?.disabled) {
			return NextResponse.json({ error: 'Anonymous invites are disabled' }, { status: 503 });
		}

		// --- Optional caller-supplied ttl, clamped to [1h, 30d] ---
		let ttlSeconds = 7 * 24 * 60 * 60;
		try {
			const body = await request.json();
			if (body && Number.isFinite(body.ttlSeconds)) {
				ttlSeconds = Math.min(Math.max(Math.floor(body.ttlSeconds), 3600), 30 * 24 * 60 * 60);
			}
		} catch {
			// no body — use default ttl
		}

		// --- Mint and record the invite ---
		const { token, payload } = mintInviteToken({ seed, iss: WEB_ISSUER_ID, ttlSeconds, uses: 1 });

		const { error: insertError } = await serviceSupabase.from('issued_invites').insert({
			jti: payload.jti,
			issuer_id: WEB_ISSUER_ID,
			issued_by: authUser.id,
			exp: new Date(payload.exp * 1000).toISOString()
		});
		if (insertError) {
			console.error('invite-anon: failed to record issued invite', insertError);
			return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 });
		}

		const origin = getAppOrigin(new URL(request.url).origin);
		const url = `${origin}/anon?invite=${encodeURIComponent(token)}`;

		return NextResponse.json({
			success: true,
			token,
			url,
			remaining: null
		});
	} catch (error) {
		console.error('invite-anon error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * Validate the Bearer session and return service client + auth user.
 * @param {import('next/server').NextRequest} request
 * @returns {Promise<{ error: NextResponse } | { error: null, serviceSupabase: any, authUser: any }>}
 */
async function authenticate(request) {
	const authHeader = request.headers.get('authorization');
	const token = getBearerToken(authHeader);

	if (!token) {
		return { error: NextResponse.json({ error: 'Missing authorization header' }, { status: 401 }) };
	}
	const supabase = await createSupabaseServerClient();
	const {
		data: { user: authUser },
		error: userError
	} = await supabase.auth.getUser(token);
	if (userError || !authUser) {
		return { error: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }) };
	}
	return { error: null, serviceSupabase: createServiceClient(), authUser };
}

/**
 * Count the invites the caller has minted.
 * @param {any} serviceSupabase
 * @param {string} authUserId
 * @returns {Promise<{ used: number, quotaError: any }>}
 */
async function getQuota(serviceSupabase, authUserId) {
	const { count, error: countError } = await serviceSupabase
		.from('issued_invites')
		.select('jti', { count: 'exact', head: true })
		.eq('issued_by', authUserId);

	return { used: count ?? 0, quotaError: countError };
}
