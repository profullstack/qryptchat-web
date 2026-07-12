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

// --- SMS abuse / cost-protection limiters (defence against SMS pumping) ---
// Each outbound SMS bills a real message via the Supabase Auth phone provider,
// so these limit by phone number and by a global circuit-breaker rather than by
// IP (which is forgeable / shared behind NAT and useless against distributed
// bots). Limits are tunable via env so they can be tightened without a deploy.
const num = (v, fallback) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Max verification codes a single phone number may request per hour. */
export const smsPerPhoneLimiter = new RateLimiter({
	maxRequests: num(process.env.SMS_PER_PHONE_HOURLY_LIMIT, 3),
	windowMs: 60 * 60 * 1000
});

/** Global circuit breaker: total codes sent across ALL clients per hour. */
export const smsGlobalHourlyLimiter = new RateLimiter({
	maxRequests: num(process.env.SMS_GLOBAL_HOURLY_LIMIT, 30),
	windowMs: 60 * 60 * 1000
});

/** Global circuit breaker: total codes sent across ALL clients per day. */
export const smsGlobalDailyLimiter = new RateLimiter({
	maxRequests: num(process.env.SMS_GLOBAL_DAILY_LIMIT, 150),
	windowMs: 24 * 60 * 60 * 1000
});

export function parseTrustedProxyCount(value = process.env.TRUSTED_PROXY_COUNT) {
	const raw = String(value ?? '0').trim();
	if (!/^\d+$/.test(raw)) return 0;
	const count = Number(raw);
	return Number.isSafeInteger(count) ? count : 0;
}

/**
 * Extract client IP from a Next.js Request object.
 *
 * SECURITY NOTE: X-Forwarded-For and X-Real-IP headers can be forged by the
 * client unless the application sits behind a trusted reverse proxy that strips
 * or overwrites these headers before forwarding.  When no trusted proxy is in
 * place, an attacker can trivially rotate the header value to bypass IP-based
 * rate limiting.
 *
 * The function honours these headers (necessary when deployed behind a load
 * balancer / CDN), but callers should be aware that in a direct-to-internet
 * deployment the returned value cannot be fully trusted.  Production deployments
 * SHOULD:
 *   1. Deploy behind a reverse proxy (nginx, Cloudflare, AWS ALB, …) that is
 *      configured to strip / overwrite X-Forwarded-For before it reaches this
 *      server, OR
 *   2. Configure TRUSTED_PROXY_COUNT in the environment and only read that many
 *      hops from the right-hand side of the X-Forwarded-For list (the rightmost
 *      entry is appended by the last trusted proxy and cannot be spoofed).
 *
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
	const trustedProxyCount = parseTrustedProxyCount();

	if (trustedProxyCount > 0) {
		// Take the Nth-from-right entry in X-Forwarded-For where N = trustedProxyCount.
		// Each trusted hop appends one IP; the rightmost `trustedProxyCount` entries
		// are injected by infrastructure we control and are reliable.
		const xff = request.headers.get('x-forwarded-for');
		if (xff) {
			const parts = xff.split(',').map(s => s.trim()).filter(Boolean);
			if (parts.length >= trustedProxyCount) {
				return parts[parts.length - trustedProxyCount];
			}
		}
	}

	// Fallback: use X-Real-IP (set by nginx real_ip module after trusted proxy
	// processing) or fall through to 'unknown'.  When TRUSTED_PROXY_COUNT is 0
	// (default / direct internet deployment) we deliberately skip the potentially
	// spoofed X-Forwarded-For header and rely on X-Real-IP only.
	return (
		request.headers.get('x-real-ip') ??
		'unknown'
	);
}

/**
 * Apply rate limiting to a Next.js request.
 * Returns a 429 Response if rate limited, or null if allowed.
 * @param {Request} request
 * @param {RateLimiter} limiter
 * @returns {Response|null}
 */
export function applyRateLimit(request, limiter = authRateLimiter) {
	const ip = getClientIp(request);
	return applyRateLimitForKey(limiter, ip);
}

/**
 * Apply rate limiting against an arbitrary key (e.g. a phone number or a fixed
 * global key) rather than the client IP. Returns a 429 Response if limited, or
 * null if allowed.
 * @param {RateLimiter} limiter
 * @param {string} key
 * @returns {Response|null}
 */
export function applyRateLimitForKey(limiter, key) {
	const { allowed, resetAt } = limiter.check(key);

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
