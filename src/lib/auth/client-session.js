/** Return the bearer header for the browser session established by phone or passkey auth. */
export function getClientAuthHeaders() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('qrypt_session');
    const session = raw ? JSON.parse(raw) : null;
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}
