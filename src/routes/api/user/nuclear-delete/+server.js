import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

export async function DELETE(event) {
	try {
		// Get authorization header
		const authHeader = event.request.headers.get('authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		// Create Supabase client and set session
		const supabase = createSupabaseServerClient(event);
		const token = authHeader.replace('Bearer ', '');

		// Set the session to ensure auth.uid() is available for RLS
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			console.error('Auth error:', authError);
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		// Set the session for RLS context
		await supabase.auth.setSession({
			access_token: token,
			refresh_token: '' // Not needed for this operation
		});
		
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
		const body = await event.request.json().catch(() => ({}));
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