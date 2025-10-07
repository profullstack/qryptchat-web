// API endpoint to find user by unique identifier
// GET /api/users/by-id/[identifier]

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { validateUniqueIdentifier } from '$lib/utils/unique-identifier.js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export async function GET({ params }) {
	// Initialize Supabase client inside the handler
	if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
		return json(
			{ error: 'Server configuration error' },
			{ status: 500 }
		);
	}

	const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
	try {
		const { identifier } = params;

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

		const user = data[0];

		// Return user profile information (public data only)
		return json({
			success: true,
			user: {
				id: user.id,
				username: user.username,
				displayName: user.display_name,
				avatarUrl: user.avatar_url,
				bio: user.bio,
				website: user.website
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