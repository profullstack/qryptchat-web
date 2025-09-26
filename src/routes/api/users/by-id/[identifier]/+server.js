// API endpoint to find user by unique identifier
// GET /api/users/by-id/[identifier]

import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { validateUniqueIdentifier } from '$lib/utils/unique-identifier.js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET({ params }) {
	try {
		const { identifier } = params;

		// Validate the identifier format
		if (!validateUniqueIdentifier(identifier)) {
			return json(
				{
					error: 'Invalid identifier format',
					details: 'Identifier must be in format qryptchat_ + 8 alphanumeric characters'
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