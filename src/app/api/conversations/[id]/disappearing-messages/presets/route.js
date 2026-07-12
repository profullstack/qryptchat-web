// Disappearing message timer presets API
// Provides common timer presets for UI

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create regular Supabase client for authentication
const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

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
			cookieHeader.split(/;\s*/).map(cookie => {
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
 * GET /api/conversations/:id/disappearing-messages/presets
 * Get common timer presets for UI
 */
export async function GET(request, { params } = {}) {
  try {
    console.log('🔐 [API] GET /api/conversations/:id/disappearing-messages/presets - Starting authentication');

    // Authenticate user
    const { user, error: authError } = await authenticateUser(request);
    if (authError || !user) {
      console.log('🔐 [API] ❌ Authentication failed:', authError);
      return NextResponse.json({ error: authError || 'Authentication failed' }, { status: 401 });
    }

    console.log('🔐 [API] ✅ User authenticated:', user.id);

    const presets = [
      { label: 'Off', seconds: 0, description: 'Messages never disappear' },
      { label: '30 seconds', seconds: 30, description: 'Messages disappear after 30 seconds' },
      { label: '1 minute', seconds: 60, description: 'Messages disappear after 1 minute' },
      { label: '5 minutes', seconds: 300, description: 'Messages disappear after 5 minutes' },
      { label: '30 minutes', seconds: 1800, description: 'Messages disappear after 30 minutes' },
      { label: '1 hour', seconds: 3600, description: 'Messages disappear after 1 hour' },
      { label: '6 hours', seconds: 21600, description: 'Messages disappear after 6 hours' },
      { label: '1 day', seconds: 86400, description: 'Messages disappear after 1 day' },
      { label: '1 week', seconds: 604800, description: 'Messages disappear after 1 week' }
    ];

    return NextResponse.json({
      success: true,
      presets,
      start_on_options: [
        { value: 'delivered', label: 'When delivered', description: 'Timer starts when message is delivered' },
        { value: 'read', label: 'When read', description: 'Timer starts when message is read' }
      ]
    });

  } catch (error) {
    console.error('Error in GET /api/conversations/:id/disappearing-messages/presets:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
