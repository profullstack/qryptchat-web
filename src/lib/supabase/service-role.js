/**
 * @fileoverview Service role Supabase client for server-side operations
 * This client bypasses Row Level Security (RLS) policies
 */

import { createClient } from '@supabase/supabase-js';

// Lazy-loaded service role client instance
let serviceRoleClient = null;

/**
 * Create Supabase service role client
 * This client has elevated permissions and bypasses RLS policies
 * Uses Node.js environment variables for compatibility with WebSocket server
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createServiceRoleClient() {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('Missing required environment variables: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
	}
	
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

/**
 * Get or create Supabase service role client (lazy initialization)
 * This client has elevated permissions and bypasses RLS policies
 * Uses lazy loading to avoid environment variable issues during module import
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getServiceRoleClient() {
	if (!serviceRoleClient) {
		serviceRoleClient = createServiceRoleClient();
	}
	return serviceRoleClient;
}