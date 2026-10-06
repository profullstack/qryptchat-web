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
	// One refresh for every request that notices: refresh tokens rotate.
	refreshing ??= Promise.resolve(refresh(session.refresh_token)).finally(() => {
		refreshing = null;
	});
	const result = await refreshing.catch(() => null);
	return result?.success ? result.session.access_token : null;
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
 * @param {{ target?: any, storage?: Storage, refresh?: (refreshToken: string) => Promise<{success: boolean, session?: any}> }} [options]
 */
export function installApiAuth({ target = typeof window !== 'undefined' ? window : undefined, refresh, storage } = {}) {
	if (!target?.fetch || target.__qryptApiAuth) return;
	target.__qryptApiAuth = true;
	const original = target.fetch.bind(target);
	target.fetch = async (input, init = {}) => {
		try {
			if (isOwnApi(input, target.location?.origin)) {
				const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
				if (!headers.has('authorization')) {
					const token = await currentAccessToken({ refresh, storage: storage ?? target.localStorage });
					if (token) {
						headers.set('authorization', `Bearer ${token}`);
						init = { ...init, headers };
					}
				}
			}
		} catch {
			// Never let the wrapper break a request; send it as it was.
		}
		return original(input, init);
	};
}
