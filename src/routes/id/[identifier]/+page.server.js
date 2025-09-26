// Server-side logic for unique identifier lookup
// Route: /id/[identifier]

import { error, redirect } from '@sveltejs/kit';
import { validateUniqueIdentifier } from '$lib/utils/unique-identifier.js';

export async function load({ params, url }) {
	const { identifier } = params;
	
	// Validate the identifier format
	if (!validateUniqueIdentifier(identifier)) {
		throw error(400, 'Invalid Profile ID: The profile ID format is invalid. Profile IDs should start with qryptchat_.');
	}

	try {
		// Look up the user by unique identifier using our API
		const response = await fetch(`${url.origin}/api/users/by-id/${identifier}`);
		
		if (!response.ok) {
			if (response.status === 404) {
				throw error(404, 'Profile Not Found: No user found with this profile ID. Please check the ID and try again.');
			}
			
			const errorData = await response.json().catch(() => ({}));
			throw error(response.status, errorData.error || 'Failed to look up user profile.');
		}

		const data = await response.json();
		const user = data.user;

		// Check if we should start a chat directly or show profile
		const action = url.searchParams.get('action');
		
		if (action === 'chat') {
			// Redirect to start a chat with this user
			// We'll pass the user ID as a parameter to the chat page
			throw redirect(302, `/chat?start_with=${user.id}`);
		}

		// Default: redirect to the user's profile page
		throw redirect(302, `/u/${user.username}`);

	} catch (err) {
		// Re-throw SvelteKit errors (redirect, error)
		if (err.status) {
			throw err;
		}
		
		console.error('Unexpected error in unique identifier lookup:', err);
		throw error(500, 'Server Error: An unexpected error occurred while looking up the profile.');
	}
}