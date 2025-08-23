/**
 * SvelteKit Server Hooks
 * Handles server-side logic including www to non-www redirects
 */

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Get the host from the request headers
	const host = event.request.headers.get('host');
	
	// Check if the request is coming from www subdomain
	if (host && host.startsWith('www.')) {
		// Extract the domain without www
		const nonWwwHost = host.slice(4); // Remove 'www.' prefix
		
		// Construct the redirect URL
		const redirectUrl = new URL(event.url);
		redirectUrl.host = nonWwwHost;
		
		// Return a 301 permanent redirect
		return new Response(null, {
			status: 301,
			headers: {
				location: redirectUrl.toString()
			}
		});
	}
	
	// Continue with normal request handling
	return resolve(event);
}