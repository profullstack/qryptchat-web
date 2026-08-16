import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';

// Directory search has to reach across every user, which is the one thing the narrowed
// `users` SELECT policy no longer allows the caller's own role to do. The lookup therefore
// runs as the service role *after* the session has been verified, and only the masked
// projection at the bottom of this handler ever leaves the server.

// A one-character query against `phone_number` turns this endpoint into an existence
// oracle: type a prefix, learn whether that number is registered. Phone matching is
// therefore only offered once the caller has supplied enough digits to already know the
// number they are asking about.
const MIN_PHONE_QUERY_LENGTH = 7;


export async function GET(request, { params } = {}) {
	try {
		const supabase = await createSupabaseServerClient();
		const url = new URL(request.url);
		const query = url.searchParams.get('q');
		
		// Get user from session
		const { data: { user }, error: userError } = await supabase.auth.getUser();
		if (userError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		if (!query || query.trim().length < 1) {
			return NextResponse.json({ users: [] });
		}
	
		const searchQuery = query.trim().toLowerCase();
		
		// Sanitize search query — escape PostgREST special characters to prevent injection
		const sanitizedQuery = searchQuery
			.replace(/\\/g, '\\\\')  // escape backslash first
			.replace(/%/g, '\\%')    // escape percent
			.replace(/_/g, '\\_')    // escape underscore
			.replace(/,/g, '')       // remove commas (PostgREST filter separator)
			.replace(/\(/g, '')      // remove open parens (PostgREST operators)
			.replace(/\)/g, '')      // remove close parens
			.replace(/\./g, '');     // remove dots (PostgREST column separator)

		if (sanitizedQuery.trim().length < 1) {
			return NextResponse.json({ users: [] });
		}
		
		// Enhanced fuzzy search across multiple fields with relevance scoring
		// Search by username, display_name (full name), phone_number, and unique_identifier
		const filters = [
			`username.ilike.%${sanitizedQuery}%`,
			`display_name.ilike.%${sanitizedQuery}%`,
			`unique_identifier.ilike.%${sanitizedQuery}%`
		];
		if (sanitizedQuery.length >= MIN_PHONE_QUERY_LENGTH) {
			filters.push(`phone_number.ilike.%${sanitizedQuery}%`);
		}

		const { data, error } = await getServiceRoleClient()
			.from('users')
			.select('id, username, display_name, avatar_url, phone_number, unique_identifier')
			.or(filters.join(','))
			.neq('auth_user_id', user.id) // Exclude current user by the auth UUID
			.limit(50); // Get more results for better sorting
	
		if (error) {
			console.error('Database error:', error);
			return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
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

		return NextResponse.json({ users });
	} catch (error) {
		console.error('API error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
