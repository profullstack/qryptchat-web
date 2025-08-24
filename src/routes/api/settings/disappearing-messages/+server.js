import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';

const supabase = createServiceRoleClient();

/** @type {import('./$types').RequestHandler} */
export async function GET({ request }) {
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		const token = authHeader.split(' ')[1];
		
		// Verify the JWT token and get user
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		// Get user's current disappearing messages setting
		const { data: profile, error: profileError } = await supabase
			.from('users')
			.select('default_message_retention_days')
			.eq('auth_user_id', user.id)
			.single();

		if (profileError) {
			console.error('Error fetching user profile:', profileError);
			return json({ error: 'Failed to fetch user settings' }, { status: 500 });
		}

		return json({
			success: true,
			default_message_retention_days: profile.default_message_retention_days
		});

	} catch (error) {
		console.error('Error in disappearing messages GET:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

/** @type {import('./$types').RequestHandler} */
export async function PUT({ request }) {
	try {
		const authHeader = request.headers.get('authorization');
		if (!authHeader?.startsWith('Bearer ')) {
			return json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		const token = authHeader.split(' ')[1];
		
		// Verify the JWT token and get user
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			return json({ error: 'Invalid token' }, { status: 401 });
		}

		const { default_message_retention_days } = await request.json();

		// Validate input
		if (typeof default_message_retention_days !== 'number' || default_message_retention_days < 0) {
			return json({ error: 'Invalid retention days value' }, { status: 400 });
		}

		// Update user's disappearing messages setting
		const { error: updateError } = await supabase
			.from('users')
			.update({
				default_message_retention_days,
				updated_at: new Date().toISOString()
			})
			.eq('auth_user_id', user.id);

		if (updateError) {
			console.error('Error updating user profile:', updateError);
			return json({ error: 'Failed to update settings' }, { status: 500 });
		}

		return json({
			success: true,
			message: 'Disappearing messages setting updated successfully'
		});

	} catch (error) {
		console.error('Error in disappearing messages PUT:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}