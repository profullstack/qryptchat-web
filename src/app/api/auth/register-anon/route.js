/**
 * @fileoverview API endpoint for anonymous + invite-only registration.
 * Validates an anonymous Supabase session, verifies a single-use Ed25519
 * invite token, and atomically redeems it while creating the user account
 * and storing the on-device ML-KEM-1024 public key.
 *
 * Additive only: does NOT touch the existing phone+SMS path.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { verifyInviteToken, InviteVerificationError } from '@/lib/invites/verify.js';

/** Postgres unique-violation error code. */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * @param {string | null} authHeader
 * @returns {string | null}
 */
function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

/**
 * Build a service-role Supabase client (bypasses RLS).
 * Mirrors the pattern used by the phone/SMS verify-sms route.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createServiceClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

/**
 * POST /api/auth/register-anon
 *
 * Auth: `Authorization: Bearer <anon supabase access_token>`
 * Body: { inviteToken, username, displayName?, publicKey }
 * Returns: { success, user: { id, username, display_name, account_type } }
 *
 * @param {import('next/server').NextRequest} request
 */
export async function POST(request) {
	try {
		// --- Parse body ---
		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
		}

		const { inviteToken, username, displayName, publicKey } = body || {};

		if (!inviteToken || typeof inviteToken !== 'string') {
			return NextResponse.json({ error: 'Invite token is required' }, { status: 400 });
		}
		if (!username || typeof username !== 'string') {
			return NextResponse.json({ error: 'Username is required' }, { status: 400 });
		}
		if (!publicKey || typeof publicKey !== 'string') {
			return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
		}

		// --- Validate anonymous Bearer session ---
		const authHeader = request.headers.get('authorization');
		const token = getBearerToken(authHeader);
		if (!token) {
			return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 });
		}

		const supabase = await createSupabaseServerClient();
		const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token);
		if (userError || !authUser) {
			return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
		}

		const serviceSupabase = createServiceClient();

		// --- Verify the invite token (issuer pubkey injected from DB) ---
		let payload;
		try {
			payload = await verifyInviteToken(inviteToken, async (iss) => {
				const { data: issuer } = await serviceSupabase
					.from('invite_issuers')
					.select('ed25519_public_key, disabled')
					.eq('id', iss)
					.single();
				if (!issuer || issuer.disabled) {
					return null;
				}
				return issuer.ed25519_public_key;
			});
		} catch (err) {
			if (err instanceof InviteVerificationError) {
				return NextResponse.json(
					{ error: 'Invalid or expired invite', code: err.code },
					{ status: 400 }
				);
			}
			throw err;
		}

		// --- Reject duplicate username up front (case-insensitive) ---
		const { data: usernameCheck } = await serviceSupabase
			.from('users')
			.select('id')
			.ilike('username', username)
			.single();
		if (usernameCheck) {
			return NextResponse.json(
				{ success: false, error: 'Username is already taken' },
				{ status: 409 }
			);
		}

		// --- Redeem invite: insert jti FIRST to burn the token (double-spend guard) ---
		const { error: redeemError } = await serviceSupabase
			.from('registration_invites')
			.insert({
				jti: payload.jti,
				issuer_id: payload.iss,
				redeemed_by: authUser.id,
				exp: new Date(payload.exp * 1000).toISOString()
			});
		if (redeemError) {
			if (redeemError.code === PG_UNIQUE_VIOLATION) {
				return NextResponse.json(
					{ error: 'Invite already used', code: 'invite_used' },
					{ status: 400 }
				);
			}
			console.error('register-anon: invite redeem failed', redeemError);
			return NextResponse.json({ error: 'Failed to redeem invite' }, { status: 500 });
		}

		// --- Create the user row (phone NULL, anonymous account) ---
		const { data: newUser, error: createError } = await serviceSupabase
			.from('users')
			.insert({
				auth_user_id: authUser.id,
				phone_number: null,
				account_type: 'anonymous',
				username,
				display_name: displayName || username,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.select()
			.single();

		if (createError) {
			// Compensate: free the burned invite so it can be retried.
			await serviceSupabase.from('registration_invites').delete().eq('jti', payload.jti);
			if (createError.code === PG_UNIQUE_VIOLATION) {
				return NextResponse.json(
					{ success: false, error: 'Username is already taken' },
					{ status: 409 }
				);
			}
			console.error('register-anon: user creation failed', createError);
			return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
		}

		// --- Store the ML-KEM-1024 public key ---
		const { error: keyError } = await serviceSupabase
			.from('user_public_keys')
			.insert({
				user_id: authUser.id,
				key_type: 'ML-KEM-1024',
				public_key: publicKey
			});

		if (keyError) {
			// Compensate: roll back the user row and the burned invite.
			await serviceSupabase.from('users').delete().eq('id', newUser.id);
			await serviceSupabase.from('registration_invites').delete().eq('jti', payload.jti);
			console.error('register-anon: public key insert failed', keyError);
			return NextResponse.json({ error: 'Failed to store public key' }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			user: {
				id: newUser.id,
				username: newUser.username,
				display_name: newUser.display_name,
				account_type: newUser.account_type
			}
		});
	} catch (error) {
		console.error('register-anon error:', error);
		return NextResponse.json(
			{ error: 'Internal server error', code: 'INTERNAL_ERROR' },
			{ status: 500 }
		);
	}
}
