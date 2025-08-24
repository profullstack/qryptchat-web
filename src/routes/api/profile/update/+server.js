import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	try {
		const { bio, website } = await event.request.json();

		// Get authorization header
		const authHeader = event.request.headers.get('authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		// Create Supabase client and verify user
		const supabase = createSupabaseServerClient(event);
		const token = authHeader.replace('Bearer ', '');

		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			console.error('Auth error:', authError);
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		console.log('Authenticated user from JWT:', { id: user.id, email: user.email, phone: user.phone });

		// Find user by auth_user_id
		const { data: existingUsers, error: userCheckError } = await supabase
			.from('users')
			.select('id, username, display_name, auth_user_id')
			.eq('auth_user_id', user.id);

		if (userCheckError) {
			console.error('Error checking user in users table:', { userId: user.id, error: userCheckError });
			return json({ error: 'Database error while checking user' }, { status: 500 });
		}

		if (!existingUsers || existingUsers.length === 0) {
			console.error('User not found in users table:', {
				jwtUserId: user.id,
				message: 'No user found with matching auth_user_id'
			});
			return json({
				error: 'User profile not found. Please log out and log back in to refresh your session.'
			}, { status: 404 });
		}

		const existingUser = existingUsers[0];
		console.log('Found existing user:', existingUser);

		// Validate input
		if (bio && typeof bio !== 'string') {
			return json({ error: 'Bio must be a string' }, { status: 400 });
		}

		if (website && typeof website !== 'string') {
			return json({ error: 'Website must be a string' }, { status: 400 });
		}

		// Validate bio length
		if (bio && bio.length > 500) {
			return json({ error: 'Bio must be 500 characters or less' }, { status: 400 });
		}

		// Validate website URL format if provided
		if (website && website.trim()) {
			const websiteUrl = website.trim();
			// Basic URL validation - allow with or without protocol
			const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
			if (!urlPattern.test(websiteUrl)) {
				return json({ error: 'Please enter a valid website URL' }, { status: 400 });
			}
		}

		// Prepare update data
		const updateData = {
			updated_at: new Date().toISOString(),
			...(bio !== undefined && { bio: bio.trim() || null }),
			...(website !== undefined && { website: website.trim() || null })
		};

		// Update user profile using the found user's ID
		const { data: updatedUsers, error: updateError } = await supabase
			.from('users')
			.update(updateData)
			.eq('id', existingUser.id)
			.select('id, username, display_name, avatar_url, bio, website');

		if (updateError) {
			console.error('Error updating profile:', updateError);
			return json({ error: 'Failed to update profile' }, { status: 500 });
		}

		// Check if any rows were updated
		if (!updatedUsers || updatedUsers.length === 0) {
			console.error('No rows updated - user not found or RLS policy blocked update');
			return json({ error: 'Profile update failed - user not found or permission denied' }, { status: 404 });
		}

		const updatedUser = updatedUsers[0];

		// Transform response data
		const responseData = {
			id: updatedUser.id,
			username: updatedUser.username,
			displayName: updatedUser.display_name,
			avatarUrl: updatedUser.avatar_url,
			bio: updatedUser.bio,
			website: updatedUser.website
		};

		return json({ 
			success: true, 
			user: responseData 
		});

	} catch (err) {
		console.error('Profile update error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}