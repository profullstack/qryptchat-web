/**
 * @fileoverview Destination filtering for outbound verification SMS.
 *
 * SMS pumping (IRSF) works because a message to a premium range costs ~55x a
 * domestic one — $0.4588 to +996 versus $0.0083 to +1, measured on this
 * account during the 2026-06/07 incident. Blocking the destination is the only
 * control that prevents the spend rather than merely bounding it.
 *
 * This is defence in depth, NOT the primary control. Twilio Geo Permissions is
 * authoritative because it also covers calls that reach Supabase Auth directly
 * with the public anon key, bypassing this route entirely.
 */

/**
 * Country calling codes blocked by default: destinations that were targeted
 * during the incident AND have zero registered users, so blocking them cannot
 * lock out an existing account.
 *
 * Deliberately EXCLUDES +380 (Ukraine), +358 (Finland) and +212 (Morocco).
 * Those were also targeted, but each has a real user who has sent messages —
 * blocking them would cut off legitimate accounts. For an E2E messenger the
 * countries on generic "high-risk telecom" lists are often exactly where the
 * product matters most, so this list stays narrow and evidence-based.
 *
 * @type {readonly string[]}
 */
export const DEFAULT_BLOCKED_CALLING_CODES = Object.freeze([
	'996', // Kyrgyzstan — 171 fraud numbers, $0.4588/msg
	'959', // Myanmar
	'961', // Lebanon
	'201', // Egypt
	'92', // Pakistan
	'77' // Kazakhstan
]);

/**
 * Parse a comma-separated calling-code list, tolerating '+' prefixes and
 * whitespace. Invalid entries are dropped rather than throwing, so a typo in
 * config can never take the signup flow down.
 * @param {string | undefined} raw
 * @returns {string[] | null} null when unset, so callers can fall back
 */
export function parseCallingCodes(raw) {
	if (typeof raw !== 'string' || !raw.trim()) return null;

	return raw
		.split(',')
		.map((code) => code.trim().replace(/^\+/, ''))
		.filter((code) => /^\d{1,4}$/.test(code));
}

/**
 * Resolve the active blocklist from the environment, falling back to the
 * evidence-based default. Set SMS_BLOCKED_COUNTRY_CODES='' to disable.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function getBlockedCallingCodes(env = process.env) {
	const configured = parseCallingCodes(env.SMS_BLOCKED_COUNTRY_CODES);
	if (configured) return configured;

	// An explicitly empty string means "block nothing" — honour it.
	if (typeof env.SMS_BLOCKED_COUNTRY_CODES === 'string') return [];

	return [...DEFAULT_BLOCKED_CALLING_CODES];
}

/**
 * Is this E.164 number destined for a blocked country?
 *
 * Matches on longest code first so a 1-digit code can never shadow a more
 * specific 3-digit one.
 *
 * @param {string} phoneNumber E.164, e.g. '+996556175367'
 * @param {string[]} [blocked] defaults to the configured list
 * @returns {{ blocked: boolean, callingCode: string | null }}
 */
export function checkDestination(phoneNumber, blocked = getBlockedCallingCodes()) {
	if (typeof phoneNumber !== 'string') return { blocked: false, callingCode: null };

	const digits = phoneNumber.replace(/\D/g, '');
	if (!digits) return { blocked: false, callingCode: null };

	const match = [...blocked]
		.sort((a, b) => b.length - a.length)
		.find((code) => digits.startsWith(code));

	return { blocked: Boolean(match), callingCode: match ?? null };
}
