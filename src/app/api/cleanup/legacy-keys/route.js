import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { createServiceRoleClient } from '@/lib/supabase/service-role.js';


export async function DELETE(request) {
	try {
		// Use createSupabaseServerClient (reads cookies server-side) and validate
		// with getUser() rather than getSession() to ensure the JWT is re-verified
		// against the Supabase Auth server and cannot be spoofed via cookie tampering.
		const supabase = await createSupabaseServerClient();
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError || !user) {
			console.error('Authentication failed - no valid user found');
			return NextResponse.json({ error: 'Unauthorized - No valid session', details: 'Please login again' }, { status: 401 });
		}

		// Resolve the internal user ID from the Supabase Auth UUID.
		const serviceRoleClient = createServiceRoleClient();
		const { data: internalUser, error: internalUserError } = await serviceRoleClient
			.from('users')
			.select('id')
			.eq('auth_user_id', user.id)
			.single();

		if (internalUserError || !internalUser) {
			console.error('User record not found for auth_user_id:', user.id);
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}

		const internalUserId = internalUser.id;
		console.log(`Authenticated user ${internalUserId} requesting legacy key cleanup (own keys only)`);

		// SECURITY FIX: Scope the query to the authenticated user's keys ONLY.
		// Previously the query fetched ALL user_public_keys without a user_id filter,
		// allowing any authenticated user to delete other users' public keys — a
		// privilege-escalation / denial-of-service against the entire user base.
		const { data: legacyKeys, error: findError } = await serviceRoleClient
			.from('user_public_keys')
			.select('*')
			.eq('user_id', internalUserId);

		if (findError) {
			console.error('Error finding legacy keys:', findError);
			return NextResponse.json({ error: findError.message }, { status: 500 });
		}

		// Function to check if a key is valid ML-KEM-1024 format
		const isValidMlKem1024Key = (/** @type {any} */ key) => {
			try {
				// Skip if no public_key
				if (!key.public_key) return false;

				// Check for obvious ML-KEM-1024 marker
				if (key.public_key.includes('ML-KEM-1024')) return true;

				// Estimate decoded size by base64 length
				// Base64 encodes 3 bytes in 4 characters, so decode length ≈ (base64Length * 3) / 4
				const estimatedBytes = (key.public_key.length * 3) / 4;

				// ML-KEM-1024 keys are 1568 bytes when decoded
				// Use a range to account for some variation
				const isSizeValid = estimatedBytes >= 1550 && estimatedBytes <= 1590;

				// Additional format checks for more aggressive detection
				// 1. Check for invalid base64 characters
				const hasInvalidChars = /[^A-Za-z0-9+/=]/.test(key.public_key);

				// 2. Check for patterns that indicate corrupted keys
				const hasCorruptedPattern = key.public_key.includes('null') ||
										   key.public_key.includes('undefined') ||
										   key.public_key.includes('[object');

				// 3. Check for keys that are too clean (all the same character)
				const tooManyRepeats = /(.)\1{20,}/.test(key.public_key);

				return isSizeValid && !hasInvalidChars && !hasCorruptedPattern && !tooManyRepeats;
			} catch (e) {
				console.error('Error checking key format:', e);
				return false;
			}
		};

		// Filter for non-ML-KEM-1024 keys belonging to the authenticated user
		const nonMlKem1024Keys = legacyKeys.filter(key => !isValidMlKem1024Key(key));

		console.log(`Found ${nonMlKem1024Keys.length} legacy keys out of ${legacyKeys.length} total keys for user ${internalUserId}`);

		if (nonMlKem1024Keys.length === 0) {
			return NextResponse.json({
				message: 'No legacy keys found',
				updatedCount: 0
			});
		}

		// Delete only the authenticated user's legacy keys.
		// The extra .eq('user_id', internalUserId) is a defence-in-depth guard.
		let deletedCount = 0;

		for (const key of nonMlKem1024Keys) {
			const { error: deleteError } = await serviceRoleClient
				.from('user_public_keys')
				.delete()
				.eq('id', key.id)
				.eq('user_id', internalUserId); // defence-in-depth ownership check

			if (deleteError) {
				console.error(`Error deleting legacy key ${key.id}:`, deleteError);
			} else {
				deletedCount++;
			}
		}

		return NextResponse.json({
			message: 'Successfully deleted legacy keys',
			deletedCount,
			totalLegacyKeys: nonMlKem1024Keys.length
		});
	} catch (error) {
		console.error('Unexpected error handling legacy keys:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}
