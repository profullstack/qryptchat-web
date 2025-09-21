import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Create regular Supabase client for authentication
const supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Authenticate user from request cookies
 * @param {Request} request - The request object
 * @returns {Promise<{user: Object|null, error: string|null}>}
 */
async function authenticateUser(request) {
	try {
		let accessToken = null;
		
		// First, check for Authorization header (priority)
		const authHeader = request.headers.get('authorization');
		if (authHeader?.startsWith('Bearer ')) {
			accessToken = authHeader.replace('Bearer ', '');
			console.log('🔐 [API] ✅ Using JWT from Authorization header');
			console.log('🔐 [API] JWT segments count:', accessToken.split('.').length);
			console.log('🔐 [API] JWT preview:', accessToken.substring(0, 50) + '...');
		} else {
			// Fallback to cookies
			const cookieHeader = request.headers.get('cookie');
			if (!cookieHeader) {
				return { user: null, error: 'No authentication found' };
			}

			// Extract access token from cookies
			const cookies = Object.fromEntries(
				cookieHeader.split('; ').map(cookie => {
					const [name, ...rest] = cookie.split('=');
					return [name, rest.join('=')];
				})
			);

			// Try standard cookie names first
			accessToken = cookies['sb-access-token'] || cookies['sb-refresh-token'];
			
			// If not found, look for the base64 encoded auth token format
			if (!accessToken) {
				for (const [cookieName, cookieValue] of Object.entries(cookies)) {
					if (cookieName.includes('auth-token') && cookieValue.startsWith('base64-')) {
						try {
							// Decode the base64 JSON
							const base64Data = cookieValue.replace('base64-', '');
							const decodedData = Buffer.from(base64Data, 'base64').toString('utf8');
							const authData = JSON.parse(decodedData);
							
							// Extract the access token from the decoded data
							if (authData.access_token) {
								accessToken = authData.access_token;
								console.log('🔐 [API] ✅ Found access token in base64 auth cookie');
								break;
							}
						} catch (decodeError) {
							console.log('🔐 [API] ❌ Failed to decode auth cookie:', decodeError.message);
						}
					}
				}
			}
		}
		
		if (!accessToken) {
			return { user: null, error: 'No authentication tokens found' };
		}

		// Verify the JWT token with regular Supabase client
		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error) {
			console.log('🔐 [API] ❌ JWT validation failed:', error.message);
			console.log('🔐 [API] Token preview:', accessToken.substring(0, 50) + '...');
			return { user: null, error: `Authentication failed: ${error.message}` };
		}

		if (!user) {
			return { user: null, error: 'Invalid authentication token' };
		}

		console.log('🔐 [API] ✅ JWT validation successful for user:', user.id);
		return { user, error: null };

	} catch (error) {
		console.error('🔐 [API] ❌ Authentication error:', error);
		return { user: null, error: 'Authentication system error' };
	}
}

export async function DELETE({ request }) {
	try {
		console.log('🔐 [API] DELETE /api/user/nuclear-delete - Starting authentication');

		// Authenticate user
		const { user, error: authError } = await authenticateUser(request);
		if (authError || !user) {
			console.log('🔐 [API] ❌ Authentication failed:', authError);
			return json({ error: authError || 'Authentication failed' }, { status: 401 });
		}

		console.log('🔐 [API] ✅ User authenticated:', user.id);
		
		// Get internal user ID from auth_user_id
		const { data: userData, error: userError } = await createServiceRoleClient()
			.from('users')
			.select('id, phone_number, username')
			.eq('auth_user_id', user.id)
			.single();
		
		if (userError || !userData) {
			console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
			return json({ error: 'User not found' }, { status: 404 });
		}
		
		const userId = userData.id;
		console.log('🔐 [API] ✅ Internal user ID:', userId);
		
		// Additional confirmation check - require confirmation in request body
		const body = await request.json().catch(() => ({}));
		const { confirmation } = body;
		
		if (confirmation !== 'DELETE_ALL_MY_DATA') {
			return json({
				error: 'Nuclear delete requires explicit confirmation',
				required_confirmation: 'DELETE_ALL_MY_DATA'
			}, { status: 400 });
		}
		
		console.log(`🔐 [API] Encrypted data delete initiated for user ${userId} (${userData.phone_number})`);
		
		// Call the encrypted data delete function (preserves account)
		const { data: result, error: deleteError } = await createServiceRoleClient()
			.rpc('delete_encrypted_data_only', {
				target_user_id: userId
			});
		
		if (deleteError) {
			console.error('Encrypted data delete error:', deleteError);
			
			// Handle specific error cases
			if (deleteError.message?.includes('Users can only delete their own data')) {
				return json({ error: 'Unauthorized: Can only delete own data' }, { status: 403 });
			}
			if (deleteError.message?.includes('User must be authenticated')) {
				return json({ error: 'Authentication required' }, { status: 401 });
			}
			if (deleteError.message?.includes('User not found')) {
				return json({ error: 'User not found' }, { status: 404 });
			}
			
			return json({
				error: 'Encrypted data delete failed',
				details: deleteError.message
			}, { status: 500 });
		}
		
		if (!result) {
			return json({ error: 'Encrypted data delete returned no result' }, { status: 500 });
		}
		
		console.log(`Encrypted data delete completed for user ${userId}:`, result);
		
		// Return success with deletion summary
		return json({
			success: true,
			message: 'All encrypted data has been permanently deleted. Your account remains active.',
			user_info: {
				phone_number: userData.phone_number,
				username: userData.username
			},
			deletion_summary: result
		}, { status: 200 });
		
	} catch (error) {
		console.error('Nuclear delete API error:', error);
		return json({ 
			error: 'Internal server error',
			message: 'An unexpected error occurred during nuclear delete'
		}, { status: 500 });
	}
}

// Ensure only DELETE method is allowed
export async function GET() {
	return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function POST() {
	return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
	return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PATCH() {
	return json({ error: 'Method not allowed' }, { status: 405 });
}