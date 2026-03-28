// API endpoint to find user by unique identifier
// GET /api/users/by-id/[identifier]

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { validateUniqueIdentifier } from '$lib/utils/unique-identifier.js';

export async function GET(event) {
	try {
		// Use session-based client instead of service role
		const supabase = createSupabaseServerClient(event);

		// Authentication check
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { identifier } = event.params;

		// Validate the identifier format
		if (!validateUniqueIdentifier(identifier)) {
			return json(
				{
					error: 'Invalid identifier format',
					details: 'Identifier must be in format qryptchat + 8 alphanumeric characters'
				},
				{ status: 400 }
			);
		}

		// Use the database function to find user by unique identifier
		const { data, error } = await supabase
			.rpc('find_user_by_unique_identifier', { identifier });

		if (error) {
			console.error('Database error finding user by identifier:', error);
			return json(
				{ error: 'Database error occurred' }, 
				{ status: 500 }
			);
		}

		// Check if user was found
		if (!data || data.length === 0) {
			return json(
				{ 
					error: 'User not found',
					details: 'No user found with the provided identifier'
				}, 
				{ status: 404 }
			);
		}

		const foundUser = data[0];

		// Return user profile information (public data only)
		return json({
			success: true,
			user: {
				id: foundUser.id,
				username: foundUser.username,
				displayName: foundUser.display_name,
				avatarUrl: foundUser.avatar_url,
				bio: foundUser.bio,
				website: foundUser.website
			}
		});

	} catch (err) {
		console.error('Error in user lookup by identifier:', err);
		return json(
			{ error: 'Internal server error' }, 
			{ status: 500 }
		);
	}
}
