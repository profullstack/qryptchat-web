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

// Strict rate limiter for key backup restore (PIN brute-force protection)
const keyBackupRateLimiter = new RateLimiter({
	IP: [5, 'h'], // 5 attempts per hour per IP
	IPUA: [3, 'h'] // 3 attempts per hour per IP+UserAgent
});

/**
 * Rate limiting middleware
 * @type {import('@sveltejs/kit').Handle}
 */
async function rateLimitHandle({ event, resolve }) {
	const path = event.url.pathname;

	// Extra strict rate limiting for key backup (PIN brute-force protection)
	if (path === '/api/auth/key-backup' && event.request.method === 'GET') {
		if (await keyBackupRateLimiter.isLimited(event)) {
			return new Response(JSON.stringify({ error: 'Too many restore attempts. Try again later.' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}
	// Apply strict rate limiting to auth endpoints
	else if (path.startsWith('/api/auth/')) {
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

/**
 * Security headers middleware
 * @type {import('@sveltejs/kit').Handle}
 */
async function securityHeadersHandle({ event, resolve }) {
	const response = await resolve(event);

	// Only add headers to HTML responses (not API/binary responses)
	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('text/html') || contentType === '') {
		const path = event.url.pathname;
		// Skip API routes — they have their own content-type and don't need HTML security headers
		if (!path.startsWith('/api/')) {
			response.headers.set(
				'Strict-Transport-Security',
				'max-age=31536000; includeSubDomains'
			);
			response.headers.set('X-Content-Type-Options', 'nosniff');
			response.headers.set('X-Frame-Options', 'SAMEORIGIN');
			response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		}
	}

	return response;
}

// Combine hooks: rate limiting, www redirect, then security headers
export const handle = sequence(rateLimitHandle, wwwRedirectHandle, securityHeadersHandle);