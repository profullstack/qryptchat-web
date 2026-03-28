/**
 * @fileoverview Simple in-memory rate limiter for API endpoints.
 * Uses a Map with TTL-based cleanup. Suitable for single-instance deployments.
 * For multi-instance, replace with Redis-backed rate limiting.
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} maxRequests - Maximum requests allowed in the window
 * @property {number} windowMs - Time window in milliseconds
 */

const DEFAULT_CONFIG = {
	maxRequests: 5,
	windowMs: 60 * 1000 // 1 minute
};

class RateLimiter {
	/**
	 * @param {RateLimitConfig} config
	 */
	constructor(config = DEFAULT_CONFIG) {
		this.maxRequests = config.maxRequests;
		this.windowMs = config.windowMs;
		/** @type {Map<string, { count: number, resetAt: number }>} */
		this.clients = new Map();

		// Cleanup stale entries every 5 minutes
		this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
		// Allow GC if nothing else holds a ref
		if (this._cleanupInterval.unref) this._cleanupInterval.unref();
	}

	/**
	 * Check if a request is allowed and consume a token.
	 * @param {string} key - Client identifier (typically IP address)
	 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
	 */
	check(key) {
		const now = Date.now();
		const record = this.clients.get(key);

		if (!record || now > record.resetAt) {
			// New window
			this.clients.set(key, { count: 1, resetAt: now + this.windowMs });
			return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs };
		}

		if (record.count >= this.maxRequests) {
			return { allowed: false, remaining: 0, resetAt: record.resetAt };
		}

		record.count++;
		return { allowed: true, remaining: this.maxRequests - record.count, resetAt: record.resetAt };
	}

	/** Remove expired entries */
	_cleanup() {
		const now = Date.now();
		for (const [key, record] of this.clients) {
			if (now > record.resetAt) {
				this.clients.delete(key);
			}
		}
	}
}

// Pre-configured rate limiters for common endpoints
export const authRateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60 * 1000 }); // 5 req/min
export const apiRateLimiter = new RateLimiter({ maxRequests: 30, windowMs: 60 * 1000 }); // 30 req/min

/**
 * SvelteKit helper: extract client IP from request event
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {string}
 */
export function getClientIp(event) {
	return event.getClientAddress() || 'unknown';
}

/**
 * SvelteKit helper: apply rate limiting to a request event.
 * Returns a 429 Response if rate limited, or null if allowed.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {RateLimiter} limiter
 * @returns {Response|null}
 */
export function applyRateLimit(event, limiter = authRateLimiter) {
	const ip = getClientIp(event);
	const { allowed, remaining, resetAt } = limiter.check(ip);

	if (!allowed) {
		const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
		return new Response(
			JSON.stringify({ error: 'Too many requests. Please try again later.' }),
			{
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': String(retryAfter),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000))
				}
			}
		);
	}

	return null;
}

export { RateLimiter };
