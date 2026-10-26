/**
 * Phone calls from qrypt.chat to ordinary phones (US and Canada): which numbers
 * may be called, how long a call may last, and what it costs.
 *
 * Everyone signed in gets FREE_SECONDS_PER_DAY of calls a day (UTC). Anonymous
 * accounts get none, so free minutes cannot be farmed with throwaway accounts.
 * Operators (Anthony and his agents, PHONE_OPERATOR_IDS) are not limited.
 * Telnyx bills whole seconds after a minimum; we count every started minute.
 */

export const FREE_SECONDS_PER_DAY = 10 * 60;
/** Telnyx will not accept a time limit under 30 s. */
export const MIN_CALL_SECONDS = 30;
export const OPERATOR_CALL_SECONDS = 60 * 60;
/** What a minute costs past the free allowance, in US cents (about 2x wholesale). */
export const CENTS_PER_MINUTE = 1;

/**
 * A North American number in E.164 (+1NXXNXXXXXX), or null. Accepts the usual
 * ways people type one: (408) 555-0199, 408.555.0199, 1-408-555-0199, +14085550199.
 */
export function normalizeNumber(input) {
	const digits = String(input ?? '').replace(/[^\d+]/g, '');
	let d = digits.replace(/^\+/, '');
	if (d.length === 10) d = `1${d}`;
	if (!/^1[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
	return `+${d}`;
}

/** Why a (normalized) number cannot be called, or '' when it can. */
export function blockedReason(e164) {
	if (!e164) return 'That is not a US or Canadian phone number.';
	const area = e164.slice(2, 5);
	const exchange = e164.slice(5, 8);
	// N11 service codes (211, 311, 411, 511, 611, 711, 811, 911) as area code or exchange.
	if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exchange)) return 'Service numbers like 911 cannot be called from qrypt.chat. For an emergency, use a phone.';
	// Premium-rate and pay-per-call ranges.
	if (area === '900' || area === '976' || exchange === '976') return 'Premium-rate numbers cannot be called.';
	// Fictional 555-01XX numbers never connect.
	if (exchange === '555' && /^01\d\d$/.test(e164.slice(8))) return 'That is a fictional 555 number.';
	return '';
}

/** Start of today (UTC) as an ISO string: the free allowance resets then. */
export const dayStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Free seconds left today, given what was billed today. */
export function freeSecondsLeft({ anonymous, operator, usedTodaySeconds }) {
	if (operator) return OPERATOR_CALL_SECONDS;
	if (anonymous) return 0;
	return Math.max(0, FREE_SECONDS_PER_DAY - Math.max(0, usedTodaySeconds || 0));
}

/**
 * How long the next call may last (seconds), or 0 when it cannot be placed.
 * Paid credit will add to this; until then it is the free allowance.
 */
export function callLimitSeconds(account) {
	const left = freeSecondsLeft(account);
	return left >= MIN_CALL_SECONDS ? left : 0;
}

/** Billable seconds of a connected call: from answer to hang-up, rounded up. */
export function billableSeconds(answeredAt, endedAt) {
	if (!answeredAt || !endedAt) return 0;
	const ms = Date.parse(endedAt) - Date.parse(answeredAt);
	return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Started minutes of a call, for display and (later) paid billing. */
export const startedMinutes = (seconds) => (seconds > 0 ? Math.ceil(seconds / 60) : 0);

/** +14085550199 -> (408) 555-0199 */
export function formatNumber(e164) {
	const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ''));
	return m ? `(${m[1]}) ${m[2]}-${m[3]}` : String(e164 || '');
}
