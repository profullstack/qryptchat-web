/**
 * @fileoverview Service role Supabase client for server-side operations
 * This client bypasses Row Level Security (RLS) policies
 */

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

/**
 * Create Supabase service role client
 * This client has elevated permissions and bypasses RLS policies
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createServiceRoleClient() {
	return createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}