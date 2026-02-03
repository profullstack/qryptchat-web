/**
 * SvelteKit Server Hooks
 * Handles server-side logic including www to non-www redirects and rate limiting
 */

import { RateLimiter } from 'sveltekit-rate-limiter/server';
import { sequence } from '@sveltejs/kit/hooks';

// Rate limiters for different endpoint types
const authRateLimiter = new RateLimiter({
	IP: [10, 'm'], // 10 requests per minute per IP for auth endpoints
	IPUA: [5, 'm'] // 5 requests per minute per IP+UserAgent combo
});

const webhookRateLimiter = new RateLimiter({
	IP: [100, 'm'] // 100 requests per minute for webhooks (higher limit for legitimate traffic)
});

const apiRateLimiter = new RateLimiter({
	IP: [60, 'm'], // 60 requests per minute per IP for general API
	IPUA: [30, 'm']
});

/**
 * Rate limiting middleware
 * @type {import('@sveltejs/kit').Handle}
 */
async function rateLimitHandle({ event, resolve }) {
	const path = event.url.pathname;

	// Apply strict rate limiting to auth endpoints
	if (path.startsWith('/api/auth/')) {
		if (await authRateLimiter.isLimited(event)) {
			return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
	// Apply rate limiting to webhooks
	else if (path.startsWith('/api/webhooks/')) {
		if (await webhookRateLimiter.isLimited(event)) {
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
	// Apply general rate limiting to all other API endpoints
	else if (path.startsWith('/api/')) {
		if (await apiRateLimiter.isLimited(event)) {
			return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
}

/**
 * WWW redirect middleware
 * @type {import('@sveltejs/kit').Handle}
 */
async function wwwRedirectHandle({ event, resolve }) {
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

// Combine hooks: rate limiting runs first, then www redirect
export const handle = sequence(rateLimitHandle, wwwRedirectHandle);