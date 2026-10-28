/**
 * Every same-origin /api/ request carries the session as a Bearer token.
 *
 * Passkey, CoinPay and phone sign-ins keep the session in localStorage
 * (`qrypt_session`) and never get a cookie, so the many plain `fetch('/api/…')`
 * calls in the app reached the server with no credentials at all ("No
 * encryption keys found for participants" when public keys came back 401).
 * Rather than thread a header through every call, the browser's fetch is
 * wrapped once: a request that names no Authorization gets the current token,
 * refreshed first when it is about to expire. Cookies still ride along, and
 * the server falls back to them if the token is refused.
 *
 * A token can also die before its expiry: rotating the auth server's signing
 * keys (2026-10-28) made every stored token "Unauthorized" while the app still
 * showed people signed in. So a 401 gets one refresh and one retry, and a
 * refresh token the server no longer knows ends the session (`onExpired`).
 */

const EARLY_MS = 30_000;
let refreshing = null;

function readSession(storage) {
	try {
		return JSON.parse(storage?.getItem('qrypt_session') || 'null');
	} catch {
		return null;
	}
}

/** A usable access token, refreshing an expiring one; null when there is none. */
export async function currentAccessToken({ refresh, storage = globalThis.localStorage } = {}) {
	const session = readSession(storage);
	if (!session?.access_token) return null;
	const expiresAt = Number(session.expires_at || 0) * 1000;
	if (!expiresAt || expiresAt - Date.now() > EARLY_MS) return session.access_token;
	if (!session.refresh_token || !refresh) return null;
	const result = await refreshOnce(refresh, session.refresh_token);
	return result?.success ? result.session.access_token : null;
}

/** One refresh for every request that notices: refresh tokens rotate. */
function refreshOnce(refresh, refreshToken) {
	refreshing ??= Promise.resolve(refresh(refreshToken)).finally(() => {
		refreshing = null;
	});
	return refreshing.catch(() => null);
}

/**
 * The server refused `sent`. Returns a token worth one retry, or null.
 * Calls onExpired when the refresh token itself is dead (a 4xx, not a blip).
 */
async function recoverToken({ sent, refresh, storage, onExpired }) {
	const session = readSession(storage);
	if (!session?.access_token) return null;
	// Someone already refreshed since this request went out: use theirs.
	if (session.access_token !== sent) return session.access_token;
	if (!session.refresh_token || !refresh) return null;
	const result = await refreshOnce(refresh, session.refresh_token);
	if (result?.success) return result.session.access_token;
	if (result && !result.transient) await onExpired?.();
	return null;
}

/** Is this a request to our own /api/ (not the token endpoint itself)? */
export function isOwnApi(input, origin) {
	try {
		const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, origin);
		return url.origin === origin && url.pathname.startsWith('/api/') && url.pathname !== '/api/cli/token';
	} catch {
		return false;
	}
}

/**
 * Wrap `target.fetch` (window by default) once.
 * @param {{ target?: any, storage?: Storage, refresh?: (refreshToken: string) => Promise<{success: boolean, session?: any, transient?: boolean}>, onExpired?: () => any }} [options]
 */
export function installApiAuth({ target = typeof window !== 'undefined' ? window : undefined, refresh, storage, onExpired } = {}) {
	if (!target?.fetch || target.__qryptApiAuth) return;
	target.__qryptApiAuth = true;
	const original = target.fetch.bind(target);
	target.fetch = async (input, init = {}) => {
		const store = storage ?? target.localStorage;
		let sent = null;
		try {
			if (isOwnApi(input, target.location?.origin)) {
				const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
				if (!headers.has('authorization')) {
					const token = await currentAccessToken({ refresh, storage: store });
					if (token) {
						headers.set('authorization', `Bearer ${token}`);
						init = { ...init, headers };
						sent = token;
					}
				}
			}
		} catch {
			// Never let the wrapper break a request; send it as it was.
		}
		const response = await original(input, init);
		// A Request's body is spent by the first send, so only plain calls retry.
		if (response.status !== 401 || !sent || input instanceof Request) return response;
		try {
			const token = await recoverToken({ sent, refresh, storage: store, onExpired });
			if (!token) return response;
			const headers = new Headers(init.headers);
			headers.set('authorization', `Bearer ${token}`);
			return await original(input, { ...init, headers });
		} catch {
			return response;
		}
	};
}
