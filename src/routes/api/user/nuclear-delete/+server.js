import { json } from '@sveltejs/kit';
import { createSupabaseClient } from '$lib/supabase.js';

export async function DELETE({ cookies, request }) {
	try {
		const supabase = createSupabaseClient();
		
		// Get the authenticated user from cookies/headers
		const authHeader = request.headers.get('authorization');
		const accessToken = authHeader?.replace('Bearer ', '') || cookies.get('sb-access-token');
		
		if (!accessToken) {
			return json({ error: 'Not authenticated - no access token' }, { status: 401 });
		}
		
		// Set the auth token for this request
		await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: cookies.get('sb-refresh-token') || ''
		});
		
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		
		if (authError || !user) {
			return json({ error: 'Not authenticated - invalid session' }, { status: 401 });
		}
		
		// Get user profile from database to get internal user ID
		const { data: profile, error: profileError } = await supabase
			.from('users')
			.select('id, phone_number, username')
			.eq('auth_user_id', user.id)
			.single();
		
		if (profileError) {
			console.error('Profile fetch error:', profileError);
			return json({ error: 'Failed to fetch user profile' }, { status: 500 });
		}
		
		if (!profile) {
			return json({ error: 'User profile not found' }, { status: 404 });
		}
		
		// Additional confirmation check - require confirmation in request body
		const body = await request.json().catch(() => ({}));
		const { confirmation } = body;
		
		if (confirmation !== 'DELETE_ALL_MY_DATA') {
			return json({ 
				error: 'Nuclear delete requires explicit confirmation',
				required_confirmation: 'DELETE_ALL_MY_DATA'
			}, { status: 400 });
		}
		
		console.log(`Encrypted data delete initiated for user ${profile.id} (${profile.phone_number})`);
		
		// Call the encrypted data delete function (preserves account)
		const { data: result, error: deleteError } = await supabase
			.rpc('delete_encrypted_data_only', {
				target_user_id: profile.id
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
		
		console.log(`Encrypted data delete completed for user ${profile.id}:`, result);
		
		// Return success with deletion summary
		return json({
			success: true,
			message: 'All encrypted data has been permanently deleted. Your account remains active.',
			user_info: {
				phone_number: profile.phone_number,
				username: profile.username
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