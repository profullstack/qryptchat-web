import { error } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const { username } = params;
	
	if (!username) {
		throw error(404, 'Username not provided');
	}

	const supabase = createServiceRoleClient();

	try {
		// Fetch user profile by username
		const { data: profile, error: profileError } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url, bio, website, created_at')
			.eq('username', username)
			.single();

		if (profileError) {
			if (profileError.code === 'PGRST116') {
				// No rows returned
				throw error(404, 'User not found');
			}
			console.error('Error fetching profile:', profileError);
			throw error(500, 'Failed to load profile');
		}

		if (!profile) {
			throw error(404, 'User not found');
		}

		// Transform the data to match our expected format
		const transformedProfile = {
			id: profile.id,
			username: profile.username,
			displayName: profile.display_name,
			avatarUrl: profile.avatar_url,
			bio: profile.bio,
			website: profile.website,
			createdAt: profile.created_at
		};

		return {
			profile: transformedProfile
		};

	} catch (err) {
		// Re-throw SvelteKit errors
		if (err.status) {
			throw err;
		}
		
		console.error('Unexpected error loading profile:', err);
		throw error(500, 'Failed to load profile');
	}
}