// Per-participant disappearing message timer settings API
// Allows users to configure their own disappearing message preferences

import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

// Lazy service role client creation
let supabaseServiceRole = null;
function getServiceRoleClient() {
	if (!supabaseServiceRole) {
		supabaseServiceRole = createServiceRoleClient();
	}
	return supabaseServiceRole;
}

// Create regular Supabase client for authentication
const supabaseClient = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Authenticate user from request cookies
 * @param {Request} request - The request object
 * @returns {Promise<{user: Object|null, error: string|null}>}
 */
async function authenticateUser(request) {
	try {
		// Parse cookies to get JWT token
		const cookieHeader = request.headers.get('cookie');
		if (!cookieHeader) {
			console.log('🔐 [API] ❌ No cookies found in request');
			return { user: null, error: 'No authentication cookies found' };
		}

		// Extract access token from cookies
		const cookies = Object.fromEntries(
			cookieHeader.split('; ').map(cookie => {
				const [name, ...rest] = cookie.split('=');
				return [name, rest.join('=')];
			})
		);

		const accessToken = cookies['sb-access-token'] || cookies['sb-refresh-token'];
		if (!accessToken) {
			console.log('🔐 [API] ❌ No Supabase auth tokens found in cookies');
			return { user: null, error: 'No authentication tokens found' };
		}

		console.log('🔐 [API] 🔍 Found auth token, verifying with Supabase...');

		// Verify the JWT token with regular Supabase client (not service role)
		const { data: { user }, error } = await supabaseClient.auth.getUser(accessToken);

		if (error) {
			console.log('🔐 [API] ❌ Token verification failed:', error.message);
			return { user: null, error: `Authentication failed: ${error.message}` };
		}

		if (!user) {
			console.log('🔐 [API] ❌ No user returned from token verification');
			return { user: null, error: 'Invalid authentication token' };
		}

		console.log('🔐 [API] ✅ User authenticated successfully:', user.id);
		return { user, error: null };

	} catch (error) {
		console.error('🔐 [API] ❌ Authentication error:', error);
		return { user: null, error: 'Authentication system error' };
	}
}

/**
 * GET /api/conversations/:id/disappearing-messages
 * Get current user's disappearing message settings for a conversation
 */
export async function GET({ params, request }) {
  try {
    console.log('🔐 [API] GET /api/conversations/:id/disappearing-messages - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    // Get internal user ID from auth_user_id
    const { data: userData, error: userError } = await getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userData) {
      console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userData.id;
    console.log('🔐 [API] ✅ Internal user ID:', userId);

    const conversationId = params.id;
    if (!conversationId) {
      return json({ error: 'Missing conversation ID' }, { status: 400 });
    }

    // Get user's current settings for this conversation
    const { data: participant, error } = await getServiceRoleClient()
      .from('conversation_participants')
      .select('disappear_seconds, start_on')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return json({ error: 'Not a participant in this conversation' }, { status: 403 });
      }
      console.error('Error fetching disappearing message settings:', error);
      return json({ error: 'Failed to fetch settings' }, { status: 500 });
    }

    return json({
      success: true,
      settings: {
        disappear_seconds: participant.disappear_seconds,
        start_on: participant.start_on,
        enabled: participant.disappear_seconds > 0
      }
    });

  } catch (error) {
    console.error('Error in GET /api/conversations/:id/disappearing-messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/conversations/:id/disappearing-messages
 * Update current user's disappearing message settings for a conversation
 */
export async function PUT({ params, request }) {
  try {
    console.log('🔐 [API] PUT /api/conversations/:id/disappearing-messages - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    // Get internal user ID from auth_user_id
    const { data: userData, error: userError } = await getServiceRoleClient()
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (userError || !userData) {
      console.log('🔐 [API] ❌ Failed to get internal user ID:', userError?.message);
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userId = userData.id;
    console.log('🔐 [API] ✅ Internal user ID:', userId);

    const conversationId = params.id;
    if (!conversationId) {
      return json({ error: 'Missing conversation ID' }, { status: 400 });
    }

    const { disappear_seconds, start_on } = await request.json();

    // Validate input
    if (typeof disappear_seconds !== 'number' || disappear_seconds < 0) {
      return json({ error: 'disappear_seconds must be a non-negative number' }, { status: 400 });
    }

    if (start_on && !['delivered', 'read'].includes(start_on)) {
      return json({ error: 'start_on must be either "delivered" or "read"' }, { status: 400 });
    }

    // Verify user is a participant in the conversation
    const { data: existingParticipant, error: checkError } = await getServiceRoleClient()
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .is('left_at', null)
      .single();

    if (checkError || !existingParticipant) {
      console.log('🔐 [API] ❌ User not authorized for conversation:', checkError?.message);
      return json({ error: 'Not a participant in this conversation' }, { status: 403 });
    }

    console.log('🔐 [API] ✅ User is participant in conversation');

    // Update user's settings
    const { data: updatedParticipant, error: updateError } = await getServiceRoleClient()
      .from('conversation_participants')
      .update({
        disappear_seconds,
        start_on: start_on || 'delivered'
      })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .select('disappear_seconds, start_on')
      .single();

    if (updateError) {
      console.error('Error updating disappearing message settings:', updateError);
      return json({ error: 'Failed to update settings' }, { status: 500 });
    }

    return json({
      success: true,
      settings: {
        disappear_seconds: updatedParticipant.disappear_seconds,
        start_on: updatedParticipant.start_on,
        enabled: updatedParticipant.disappear_seconds > 0
      },
      message: 'Settings updated successfully. Changes will apply to new messages only.'
    });

  } catch (error) {
    console.error('Error in PUT /api/conversations/:id/disappearing-messages:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
