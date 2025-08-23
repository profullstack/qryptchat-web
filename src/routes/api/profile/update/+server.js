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
			return json({ error: 'Invalid or expired token' }, { status: 401 });
		}

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
			updated_at: new Date().toISOString()
		};

		if (bio !== undefined) {
			updateData.bio = bio.trim() || null;
		}

		if (website !== undefined) {
			updateData.website = website.trim() || null;
		}

		// Update user profile
		const { data: updatedUser, error: updateError } = await supabase
			.from('users')
			.update(updateData)
			.eq('id', user.id)
			.select('id, username, display_name, avatar_url, bio, website')
			.single();

		if (updateError) {
			console.error('Error updating profile:', updateError);
			return json({ error: 'Failed to update profile' }, { status: 500 });
		}

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