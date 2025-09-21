import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function DELETE({ request, cookies, locals }) {
	try {
		// Get supabase client (will use cookies automatically)
		const supabase = createSupabaseClient();
		
		// Verify user is authenticated with better error handling
		const { data: { session } } = await supabase.auth.getSession();
		
		if (!session || !session.user) {
			console.error('Authentication failed - no valid session found');
			return json({ error: 'Unauthorized - No valid session', details: 'Please login again' }, { status: 401 });
		}
		
		const userId = session.user.id;
		console.log(`Authenticated user ${userId} requesting legacy key cleanup`);
		
		// Find user public keys that are not ML-KEM-1024 format
		// We can detect this by looking at the key size - ML-KEM-1024 keys are 1568 bytes
		// when decoded from Base64
		const { data: legacyKeys, error: findError } = await supabase
			.from('user_public_keys')
			.select('*');
			
		if (findError) {
			console.error('Error finding legacy keys:', findError);
			return json({ error: findError.message }, { status: 500 });
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
				// Invalid keys often have unusual patterns or characters
				
				// 1. Check for invalid base64 characters
				const hasInvalidChars = /[^A-Za-z0-9+/=]/.test(key.public_key);
				
				// 2. Check for patterns that indicate corrupted keys
				const hasCorruptedPattern = key.public_key.includes('null') ||
										   key.public_key.includes('undefined') ||
										   key.public_key.includes('[object');
				
				// 3. Check for keys that are too clean (all the same character)
				const tooManyRepeats = /(.)\1{20,}/.test(key.public_key);
				
				// A valid key must have the right size and not trigger any of the warning flags
				return isSizeValid && !hasInvalidChars && !hasCorruptedPattern && !tooManyRepeats;
			} catch (e) {
				console.error('Error checking key format:', e);
				return false;
			}
		};
		
		// Filter for non-ML-KEM-1024 keys
		const nonMlKem1024Keys = legacyKeys.filter(key => !isValidMlKem1024Key(key));
		
		console.log(`Found ${nonMlKem1024Keys.length} legacy keys out of ${legacyKeys.length} total keys`);
		
		if (nonMlKem1024Keys.length === 0) {
			return json({
				message: 'No legacy keys found',
				updatedCount: 0
			});
		}
		
		// For each legacy key, delete it from the database
		// The user will need to reset their key to the proper format
		let deletedCount = 0;
		
		for (const key of nonMlKem1024Keys) {
			const { error: deleteError } = await supabase
				.from('user_public_keys')
				.delete()
				.eq('id', key.id);
				
			if (deleteError) {
				console.error(`Error deleting legacy key ${key.id}:`, deleteError);
			} else {
				deletedCount++;
			}
		}
		
		return json({
			message: 'Successfully deleted legacy keys',
			deletedCount,
			totalLegacyKeys: nonMlKem1024Keys.length
		});
	} catch (error) {
		console.error('Unexpected error handling legacy keys:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}