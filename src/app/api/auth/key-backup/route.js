// Key Backup API endpoint
// Handles server-side storage of client-encrypted key backups

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAuthCookieName } from '@/lib/supabase/auth-cookie.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';
import { checkPin, legacyMigrationEnabled, PIN_PATTERN, PIN_RULE, resolveInternalUserId } from '@/lib/auth/backup-pin.js';
import { SEAL_VERSION, sealEnvelopeProblem } from '@/lib/crypto/key-backup-seal.js';

// node:crypto (scrypt) checks the PIN, so pin this route to the Node runtime.
export const runtime = 'nodejs';

// Lazy service role client creation
let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

// Create regular client for JWT validation
const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

/**
 * Authenticate user from request cookies
 * @param {Request} request
 * @returns {Promise<{user?: any, error?: string}>}
 */
async function authenticateUser(request) {
	try {
		// Try Authorization header first (used during login before cookies are set)
		const authHeader = request.headers.get('authorization');
		const token = getBearerToken(authHeader);
		if (token) {
			const { data: { user }, error } = await supabaseClient.auth.getUser(token);
			if (!error && user) {
				return { user };
			}
		}

		// Fall back to cookies
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			return { error: 'No authentication found' };
		}

		const cookies = Object.fromEntries(
			cookieHeader.split(/;\s*/).map(cookie => {
				const separator = cookie.indexOf('=');
				const name = separator === -1 ? cookie : cookie.slice(0, separator);
				const value = separator === -1 ? '' : cookie.slice(separator + 1);
				return [name, decodeURIComponent(value)];
			})
		);

		let accessToken = null;

		// Try Supabase-specific cookies first
		if (cookies[supabaseAuthCookieName()]) {
			try {
				let tokenData = cookies[supabaseAuthCookieName()];
				if (tokenData.startsWith('base64-')) {
					tokenData = Buffer.from(tokenData.substring(7), 'base64').toString('utf-8');
				}
				const parsed = JSON.parse(tokenData);
				accessToken = parsed.access_token;
			} catch (error) {
				console.log('Failed to parse Supabase auth cookie:', error.message);
			}
		}

		// Fallback to session cookie
		if (!accessToken && cookies.session) {
			const sessionToken = cookies.session;
			if (sessionToken.split('.').length === 3) {
				accessToken = sessionToken;
			}
		}

		if (!accessToken) {
			return { error: 'No access token found' };
		}

		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error || !user) {
			return { error: `Invalid token: ${error?.message}` };
		}

		return { user };
	} catch (error) {
		return { error: `Authentication error: ${error.message}` };
	}
}

/**
 * The JSON response for a PIN check that did not pass, or null when it did.
 * @param {Awaited<ReturnType<typeof checkPin>>} result
 */
function pinRejection(result) {
	if (result.status === 'error') {
		console.error('Error checking backup PIN:', result.error);
		return NextResponse.json({ error: 'Failed to check backup PIN' }, { status: 500 });
	}
	const retryAfter = result.status === 'locked' ? result.retryAfter : result.status === 'wrong' ? result.retryAfter : undefined;
	if (retryAfter) {
		return NextResponse.json(
			{ error: 'Too many wrong PINs. Try again later.', code: 'PIN_LOCKED', retryAfter },
			{ status: 429, headers: { 'Retry-After': String(retryAfter) } }
		);
	}
	if (result.status === 'required') {
		return NextResponse.json({ error: 'Enter your backup PIN', code: 'PIN_REQUIRED' }, { status: 403 });
	}
	if (result.status === 'wrong') {
		return NextResponse.json({ error: 'Wrong PIN', code: 'PIN_WRONG', remaining: result.remaining }, { status: 403 });
	}
	return null;
}

/**
 * GET /api/auth/key-backup
 * Whether the authenticated user has a backup, and when it was written. The
 * encrypted keys themselves only come back from POST, after the PIN checks out:
 * a short PIN must never be brute-forceable offline by whoever holds a session.
 */
export async function GET(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { data, error } = await getServiceRoleClient()
			.from('key_backups')
			.select('created_at, updated_at, seal_version')
			.eq('user_id', user.id)
			.single();

		if (error) {
			if (error.code === 'PGRST116') {
				// No rows found
				return NextResponse.json({ backup: null }, { status: 404 });
			}
			console.error('Error fetching key backup:', error);
			return NextResponse.json({ error: 'Failed to fetch key backup' }, { status: 500 });
		}

		return NextResponse.json({
			backup: {
				created_at: data.created_at,
				updated_at: data.updated_at,
				seal_version: data.seal_version ?? 1
			}
		});

	} catch (error) {
		console.error('Error in GET /api/auth/key-backup:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * POST /api/auth/key-backup  { pin? }
 * Restore. A seal-v2 backup comes back to its owner as is: it opens only with
 * the passphrase or recovery key, which never reach the server. A legacy PIN
 * backup (seal_version 1) is only handed over once the PIN checks out (wrong
 * PINs count toward a lockout), and not at all after the legacy cutoff.
 */
export async function POST(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
		}

		const db = getServiceRoleClient();
		const { data, error } = await db
			.from('key_backups')
			.select('encrypted_keys, created_at, updated_at, seal_version')
			.eq('user_id', user.id)
			.single();
		if (error) {
			if (error.code === 'PGRST116') return NextResponse.json({ backup: null }, { status: 404 });
			console.error('Error fetching key backup:', error);
			return NextResponse.json({ error: 'Failed to fetch key backup' }, { status: 500 });
		}

		const sealVersion = data.seal_version ?? 1;
		const backup = {
			encrypted_keys: data.encrypted_keys,
			created_at: data.created_at,
			updated_at: data.updated_at,
			seal_version: sealVersion
		};
		if (sealVersion >= SEAL_VERSION) {
			return NextResponse.json({ backup, user_id: user.id, legacy: false });
		}

		if (!legacyMigrationEnabled()) {
			return NextResponse.json(
				{
					error: 'This backup used a PIN, and PIN backups are no longer served. Restore from a key file or another device, or start fresh.',
					code: 'LEGACY_BACKUP_DISABLED'
				},
				{ status: 410 }
			);
		}

		const pin = typeof body?.pin === 'string' ? body.pin : '';
		if (pin && !PIN_PATTERN.test(pin)) {
			return NextResponse.json({ error: PIN_RULE }, { status: 400 });
		}
		const { userId, error: lookupError } = await resolveInternalUserId(db, user);
		if (lookupError || !userId) {
			console.error('Error resolving user for key restore:', lookupError);
			return NextResponse.json({ error: 'Failed to fetch key backup' }, { status: 500 });
		}
		const result = await checkPin(db, userId, pin);
		const rejected = pinRejection(result);
		if (rejected) return rejected;

		// legacy: the client must re-seal this under a passphrase + recovery key.
		return NextResponse.json({ backup, user_id: user.id, legacy: true, pinVerified: result.status === 'ok' });
	} catch (error) {
		console.error('Error in POST /api/auth/key-backup:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * DELETE /api/auth/key-backup
 * Remove the authenticated user's backup (complete key reset).
 */
export async function DELETE(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		const { error } = await getServiceRoleClient().from('key_backups').delete().eq('user_id', user.id);
		if (error) {
			console.error('Error deleting key backup:', error);
			return NextResponse.json({ error: 'Failed to delete key backup' }, { status: 500 });
		}
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error in DELETE /api/auth/key-backup:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

/**
 * PUT /api/auth/key-backup  { encrypted_keys, pin? }
 * Store the user's backup. Only a seal-v2 envelope is accepted: sealed in the
 * browser under a passphrase and a recovery key the server never sees. PIN
 * backups can no longer be written.
 *
 * Replacing a legacy PIN backup that has a verifiable PIN still needs that PIN,
 * as before, so a stolen session cannot swap it out. Once the seal-v2 backup is
 * stored, the PIN hash is deleted: it protects nothing any more, and a stored
 * hash of a short PIN is an offline oracle for a number people reuse.
 */
export async function PUT(request) {
	try {
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
		}
		const { encrypted_keys } = body;
		const pin = typeof body.pin === 'string' ? body.pin : '';

		if (!encrypted_keys || typeof encrypted_keys !== 'string') {
			return NextResponse.json({ error: 'Missing or invalid encrypted_keys' }, { status: 400 });
		}

		let envelope;
		try {
			envelope = JSON.parse(encrypted_keys);
		} catch {
			return NextResponse.json({ error: 'encrypted_keys must be a valid JSON string' }, { status: 400 });
		}
		if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
			return NextResponse.json({ error: 'encrypted_keys must be a JSON object string' }, { status: 400 });
		}
		const problem = sealEnvelopeProblem(envelope);
		if (problem) {
			return NextResponse.json(
				{
					error: 'Backups must be sealed with a passphrase and recovery key. Update the app and try again.',
					code: 'SEAL_REQUIRED',
					detail: problem
				},
				{ status: 400 }
			);
		}

		if (pin && !PIN_PATTERN.test(pin)) {
			return NextResponse.json({ error: PIN_RULE }, { status: 400 });
		}
		const db = getServiceRoleClient();
		const { userId, error: lookupError } = await resolveInternalUserId(db, user);
		if (lookupError || !userId) {
			console.error('Error resolving user for key backup:', lookupError);
			return NextResponse.json({ error: 'Failed to store key backup' }, { status: 500 });
		}

		const { data: existing, error: existingError } = await db
			.from('key_backups')
			.select('seal_version')
			.eq('user_id', user.id)
			.maybeSingle();
		if (existingError) {
			console.error('Error reading key backup:', existingError);
			return NextResponse.json({ error: 'Failed to store key backup' }, { status: 500 });
		}
		if (existing && (existing.seal_version ?? 1) < SEAL_VERSION) {
			const result = await checkPin(db, userId, pin);
			const rejected = pinRejection(result);
			if (rejected) return rejected;
		}

		const { data, error } = await db
			.from('key_backups')
			.upsert(
				{
					user_id: user.id,
					encrypted_keys,
					seal_version: SEAL_VERSION,
					updated_at: new Date().toISOString()
				},
				{ onConflict: 'user_id' }
			)
			.select('id, created_at, updated_at')
			.single();

		if (error) {
			console.error('Error storing key backup:', error);
			return NextResponse.json({ error: 'Failed to store key backup' }, { status: 500 });
		}

		const { error: pinDeleteError } = await db.from('user_backup_pins').delete().eq('user_id', userId);
		if (pinDeleteError) console.error('Error retiring backup PIN:', pinDeleteError.message);

		console.log(`🔑 Key backup stored for user ${user.id} (seal v${SEAL_VERSION})`);

		return NextResponse.json({
			success: true,
			backup_id: data.id,
			seal_version: SEAL_VERSION,
			created_at: data.created_at,
			updated_at: data.updated_at
		});
	} catch (error) {
		console.error('Error in PUT /api/auth/key-backup:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
