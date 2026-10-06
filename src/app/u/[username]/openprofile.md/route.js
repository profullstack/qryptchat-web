import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { PUBLIC_PROFILE_COLUMNS, toOpenProfile } from '@/lib/profile/fields.js';

/**
 * GET /u/<username>/openprofile.md: the public profile (exactly what /u/<username>
 * shows) as OpenProfile.md, logicsrc.com/openprofile. The page links it with
 * rel="openprofile".
 */
export async function GET(request, { params } = {}) {
	const { username } = (await params) || {};
	const name = username?.trim().toLowerCase();
	if (!name) return new Response('Username required\n', { status: 400 });

	const { data, error } = await getServiceRoleClient()
		.from('users')
		.select(PUBLIC_PROFILE_COLUMNS)
		.eq('username', name)
		.single();
	if (error || !data) return new Response('Profile not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

	let operator = null;
	if (data.account_type === 'agent' && data.operator_user_id) {
		const { data: op } = await getServiceRoleClient().from('users').select('username, display_name').eq('id', data.operator_user_id).maybeSingle();
		operator = op ?? null;
	}

	return new Response(toOpenProfile(data, operator), {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
}
