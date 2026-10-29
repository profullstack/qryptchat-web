/**
 * Where /auth sends someone once they are signed in. Normally /chat; a page
 * that needed a sign-in first (a `qc login` approval) can ask to come back.
 * Only our own /cli/authorize is accepted, so this is never an open redirect.
 */

const KEY = 'qrypt_after_sign_in';
const ALLOWED = /^\/cli\/authorize\?[^\s\\]*$/;

/** Remember `path` (e.g. location.pathname + location.search) for after sign-in. */
export function returnAfterSignIn(path, storage = globalThis.sessionStorage) {
	try {
		if (ALLOWED.test(path)) storage?.setItem(KEY, path);
	} catch {}
}

/** The path to go to now that sign-in finished; forgets it once read. */
export function afterSignInPath(storage = globalThis.sessionStorage) {
	try {
		const path = storage?.getItem(KEY);
		storage?.removeItem(KEY);
		if (path && ALLOWED.test(path)) return path;
	} catch {}
	return '/chat';
}
