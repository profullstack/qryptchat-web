/**
 * Noticing a new deploy in an app that never reloads.
 *
 * An installed iOS web app has no reload button, and iOS resumes it from
 * memory instead of loading it again, so it can run an old build for days
 * (Safari tabs reload far more often, which is why they look fresh). The
 * service worker file never changes between deploys, so its update event
 * never fires either. Instead the app compares the build it was loaded from
 * with the one the server runs (/api/version) whenever it comes back to the
 * foreground, and reloads itself then, unless something would be lost.
 */

export const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || null;

const busy = new Set();

/** Mark something a reload would destroy (a draft, voice mode, a call). */
export function setBusy(key, on) {
	if (on) busy.add(key);
	else busy.delete(key);
}

export const isBusy = () => busy.size > 0;

/** The build the server runs now, or null when it cannot be told (offline). */
export async function liveBuild(fetchImpl = globalThis.fetch) {
	try {
		const res = await fetchImpl('/api/version', { cache: 'no-store' });
		if (!res.ok) return null;
		return (await res.json())?.buildId || null;
	} catch {
		return null;
	}
}

export const isStale = (live, current = CURRENT_BUILD) => !!live && !!current && live !== current;

/**
 * What to do about a newer build: reload straight away when the app has just
 * come back to the foreground and nothing is in progress, otherwise offer it.
 */
export function updateAction({ stale, resumed, busy: inProgress }) {
	if (!stale) return 'none';
	return resumed && !inProgress ? 'reload' : 'offer';
}
