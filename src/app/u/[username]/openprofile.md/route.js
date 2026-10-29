import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { loadPublicProfile, toOpenProfile } from '@/lib/profile/fields.js';

/**
 * GET /u/<username>/openprofile.md: the public profile (exactly what /u/<username>
 * shows) as OpenProfile.md, logicsrc.com/openprofile. The page links it with
 * rel="openprofile". An agent names its owner; a person lists the agents they own.
 */
export async function GET(request, { params } = {}) {
	const { username } = (await params) || {};
	const name = username?.trim().toLowerCase();
	if (!name) return new Response('Username required\n', { status: 400 });

	const profile = await loadPublicProfile(getServiceRoleClient(), name);
	if (!profile) return new Response('Profile not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

	return new Response(toOpenProfile(profile.user, profile.operator, profile.agents), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
}
