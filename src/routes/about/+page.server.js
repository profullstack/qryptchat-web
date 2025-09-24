import { createServiceRoleClient } from '$lib/supabase/service-role.js';

// Lazy service role client creation
let supabase = null;
function getServiceRoleClient() {
	if (!supabase) {
		supabase = createServiceRoleClient();
	}
	return supabase;
}

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	const supabase = getServiceRoleClient();
	
	// Define team member usernames
	const teamUsernames = ['profullstack', 'chovy', 'mrpthedev'];
	
	try {
		// Fetch all team member profiles
		const { data: profiles, error: profileError } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url, bio, website, created_at')
			.in('username', teamUsernames);

		if (profileError) {
			console.error('Error fetching team profiles:', profileError);
			// Return empty array if there's an error, page will still work
			return {
				teamMembers: []
			};
		}

		// Transform and sort the profiles to match the desired order
		const transformedProfiles = profiles?.map(profile => ({
			id: profile.id,
			username: profile.username,
			displayName: profile.display_name,
			avatarUrl: profile.avatar_url,
			bio: profile.bio,
			website: profile.website,
			createdAt: profile.created_at
		})) || [];

		// Sort profiles to match the desired order (profullstack, chovy, mrpthedev)
		const sortedProfiles = teamUsernames.map(username => 
			transformedProfiles.find(profile => profile.username === username)
		).filter(Boolean); // Remove any undefined entries

		return {
			teamMembers: sortedProfiles
		};

	} catch (err) {
		console.error('Unexpected error loading team profiles:', err);
		// Return empty array if there's an error, page will still work
		return {
			teamMembers: []
		};
	}
}