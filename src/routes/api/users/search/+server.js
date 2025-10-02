import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const url = new URL(event.request.url);
		const query = url.searchParams.get('q');
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!query || query.trim().length < 1) {
			return json({ users: [] });
		}
	
		const searchQuery = query.trim().toLowerCase();
		
		// Enhanced fuzzy search across multiple fields with relevance scoring
		// Search by username, display_name (full name), phone_number, and unique_identifier
		const { data, error } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url, phone_number, unique_identifier')
			.or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%,unique_identifier.ilike.%${searchQuery}%`)
			.neq('id', user.id) // Exclude current user
			.limit(50); // Get more results for better sorting
	
		if (error) {
			console.error('Database error:', error);
			return json({ error: 'Failed to search users' }, { status: 500 });
		}
	
		// Sort results by relevance (exact matches first, then partial matches)
		const sortedUsers = (data || [])
			.map(u => {
				const username = (u.username || '').toLowerCase();
				const displayName = (u.display_name || '').toLowerCase();
				const phoneNumber = (u.phone_number || '').toLowerCase();
				const uniqueIdentifier = (u.unique_identifier || '').toLowerCase();
				
				// Calculate relevance score
				let score = 0;
				
				// Exact matches get highest score
				if (username === searchQuery) score += 100;
				if (displayName === searchQuery) score += 90;
				if (uniqueIdentifier === searchQuery) score += 95; // High priority for unique ID
				if (phoneNumber === searchQuery) score += 80;
				
				// Starts with matches get high score
				if (username.startsWith(searchQuery)) score += 70;
				if (displayName.startsWith(searchQuery)) score += 60;
				if (uniqueIdentifier.startsWith(searchQuery)) score += 75; // High priority for unique ID
				if (phoneNumber.startsWith(searchQuery)) score += 50;
				
				// Contains matches get lower score
				if (username.includes(searchQuery)) score += 30;
				if (displayName.includes(searchQuery)) score += 25;
				if (uniqueIdentifier.includes(searchQuery)) score += 35; // Higher priority for unique ID
				if (phoneNumber.includes(searchQuery)) score += 20;
				
				// Word boundary matches (for full names)
				const words = displayName.split(' ');
				for (const word of words) {
					if (word.startsWith(searchQuery)) score += 40;
					if (word === searchQuery) score += 80;
				}
				
				return {
					...u,
					score
				};
			})
			.filter(u => u.score > 0) // Only include matches
			.sort((a, b) => b.score - a.score) // Sort by relevance
			.slice(0, 10); // Limit final results
	
		// Filter out sensitive information and format results
		const users = sortedUsers.map(u => ({
			id: u.id,
			username: u.username,
			display_name: u.display_name,
			avatar_url: u.avatar_url,
			unique_identifier: u.unique_identifier,
			// Only show partial phone for privacy
			phone_partial: u.phone_number ? `***-***-${u.phone_number.slice(-4)}` : null
		}));

		return json({ users });
	} catch (error) {
		console.error('API error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}