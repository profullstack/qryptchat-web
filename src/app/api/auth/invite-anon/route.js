/**
 * @fileoverview API endpoint that lets a signed-in account mint a single-use
 * anonymous invite for someone else. Mirrors AgentBBS's issuer role, but the
 * issuer is the web app itself (`qryptchat-web`), gated by a per-account quota.
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

/** Fallback quota if the issuer row has none. */
const DEFAULT_QUOTA = 5;

/**
 * Build a service-role Supabase client (bypasses RLS).
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createServiceClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

/**
 * GET /api/auth/invite-anon — report remaining quota for the caller.
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const auth = await authenticate(request);
	if (auth.error) return auth.error;
	const { serviceSupabase, authUser } = auth;

	const { quota, used } = await getQuota(serviceSupabase, authUser.id);
	return NextResponse.json({ remaining: Math.max(0, quota - used), quota, used });
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

		// --- Enforce the per-account quota ---
		const { quota, used, issuerDisabled } = await getQuota(serviceSupabase, authUser.id);
		if (issuerDisabled) {
			return NextResponse.json({ error: 'Anonymous invites are disabled' }, { status: 503 });
		}
		if (used >= quota) {
			return NextResponse.json(
				{ error: 'Invite limit reached', code: 'quota_exceeded', quota, used },
				{ status: 429 }
			);
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

		// --- Mint and record the invite (record burns a quota slot) ---
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
			remaining: Math.max(0, quota - used - 1)
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
	if (!authHeader) {
		return { error: NextResponse.json({ error: 'Missing authorization header' }, { status: 401 }) };
	}
	const token = authHeader.replace('Bearer ', '');
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
 * Resolve the caller's quota and current usage.
 * @param {any} serviceSupabase
 * @param {string} authUserId
 * @returns {Promise<{ quota: number, used: number, issuerDisabled: boolean }>}
 */
async function getQuota(serviceSupabase, authUserId) {
	const { data: issuer } = await serviceSupabase
		.from('invite_issuers')
		.select('default_quota, disabled')
		.eq('id', WEB_ISSUER_ID)
		.single();

	const quota = issuer?.default_quota ?? DEFAULT_QUOTA;

	const { count } = await serviceSupabase
		.from('issued_invites')
		.select('jti', { count: 'exact', head: true })
		.eq('issued_by', authUserId);

	return { quota, used: count ?? 0, issuerDisabled: !!issuer?.disabled };
}
