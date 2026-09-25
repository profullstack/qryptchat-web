/**
 * The Supabase auth cookie is named after the project URL's first host label
 * (supabase-js: `sb-${hostname.split('.')[0]}-auth-token`), so it changes when
 * the project moves, e.g. from <ref>.supabase.co to supabase.qrypt.chat.
 * Derive it from NEXT_PUBLIC_SUPABASE_URL; never hard-code it.
 */
export function supabaseAuthCookieName(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
	try {
		if (url) return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
	} catch {
		// fall through: an unparsable URL gets the generic name
	}
	return 'sb-auth-token';
}
