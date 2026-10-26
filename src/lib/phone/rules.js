/**
 * Phone calls from qrypt.chat to ordinary phones: which numbers may be called,
 * how long a call may last, and what it costs.
 *
 * - Everyone signed in gets FREE_SECONDS_PER_DAY a day (UTC) of calls to the US
 *   and Canada. Anonymous accounts get none (free minutes cannot be farmed).
 * - Past that, and for every other country, calls use prepaid credit (CoinPay):
 *   US/Canada a flat 1 cent per started minute; elsewhere twice what the carrier
 *   (Telnyx) charges us for the call, read from its call records afterwards. The
 *   Telnyx profile refuses destinations costing over MAX_CARRIER_USD_PER_MINUTE,
 *   so a call is limited up front as if it cost the most it could.
 * - Operators (Anthony and his agents, PHONE_OPERATOR_IDS) are not limited.
 * Money is kept in micro-dollars (1 USD = 1,000,000) so carrier costs stay exact.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export const FREE_SECONDS_PER_DAY = 10 * 60;
/** Telnyx will not accept a time limit under 30 s. */
export const MIN_CALL_SECONDS = 30;
export const MAX_CALL_SECONDS = 60 * 60;
export const FREE_COUNTRIES = ['US', 'CA'];
/** Same list as the Telnyx outbound voice profile "qrypt.chat calls". */
export const ALLOWED_COUNTRIES = ('US CA GB IE FR DE ES PT IT NL BE LU CH AT DK SE NO FI IS PL CZ SK HU RO BG GR HR SI EE LT MT CY ' +
	'MX BR AR CL CO PE UY CR PA DO GT SV HN EC IN PH VN TH MY SG ID JP KR TW HK AU NZ IL AE SA TR EG MA ZA NG KE GH PK BD').split(' ');
export const US_CA_MICROS_PER_MINUTE = 10_000; // 1 cent
export const MAX_CARRIER_USD_PER_MINUTE = 0.1; // the Telnyx profile's max_destination_rate
/** Worst case per minute abroad: twice (the phone leg at the cap + the browser leg). */
export const INTL_MAX_MICROS_PER_MINUTE = 2 * (MAX_CARRIER_USD_PER_MINUTE * 1e6 + 2_000);
export const TOPUP_DOLLARS = [5, 10, 25];

const countryName = (code) => {
	try {
		return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
	} catch {
		return code;
	}
};

/**
 * A phone number as { e164, country } or null. Numbers without a country code are
 * read as North American; anything else needs the leading + (or 00).
 */
export function parseNumber(input) {
	let s = String(input ?? '').trim();
	if (!s) return null;
	if (s.startsWith('00')) s = `+${s.slice(2)}`;
	const digits = s.replace(/\D/g, '');
	if (!s.startsWith('+') && (digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))) s = `+1${digits.slice(-10)}`;
	if (!s.startsWith('+')) return null;
	const p = parsePhoneNumberFromString(s);
	if (!p || !p.isValid() || !p.country) return null;
	return { e164: p.number, country: p.country, type: p.getType() || '' };
}

/** Why a parsed number cannot be called, or '' when it can. */
export function blockedReason(parsed) {
	if (!parsed) return "That doesn't look like a phone number. Numbers outside the US and Canada need the country code, like +44 20 7946 0958.";
	const { e164, country, type } = parsed;
	if (!ALLOWED_COUNTRIES.includes(country)) return `Calls to ${countryName(country)} aren't available yet.`;
	if (type === 'PREMIUM_RATE' || type === 'SHARED_COST' || type === 'UAN' || type === 'PAGER') return 'Premium-rate and shared-cost numbers cannot be called.';
	if (e164.startsWith('+1')) {
		const area = e164.slice(2, 5);
		const exchange = e164.slice(5, 8);
		if (/^[2-9]11$/.test(area) || /^[2-9]11$/.test(exchange)) return 'Service numbers like 911 cannot be called from qrypt.chat. For an emergency, use a phone.';
		if (area === '900' || area === '976' || exchange === '976') return 'Premium-rate numbers cannot be called.';
		if (exchange === '555' && /^01\d\d$/.test(e164.slice(8))) return 'That is a fictional 555 number.';
	}
	return '';
}

/** Kept for callers that only care about North America: +1NXXNXXXXXX or null. */
export function normalizeNumber(input) {
	const p = parseNumber(input);
	return p && p.e164.startsWith('+1') ? p.e164 : null;
}

export const isFreeCountry = (country) => FREE_COUNTRIES.includes(country);

/** Start of today (UTC) as an ISO string: the free allowance resets then. */
export const dayStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

/** Free US/Canada seconds left today, given the free seconds used today. */
export function freeSecondsLeft({ anonymous, operator, usedTodaySeconds }) {
	if (operator) return MAX_CALL_SECONDS;
	if (anonymous) return 0;
	return Math.max(0, FREE_SECONDS_PER_DAY - Math.max(0, usedTodaySeconds || 0));
}

/** The most a minute to this country can cost the caller (micro-dollars). */
export const maxMicrosPerMinute = (country) => (isFreeCountry(country) ? US_CA_MICROS_PER_MINUTE : INTL_MAX_MICROS_PER_MINUTE);

/**
 * How the next call to `country` is limited: { limit, free } in seconds (0 limit =
 * cannot call). Free seconds come first (US/Canada); the rest is what the
 * balance pays for at the worst-case rate.
 */
export function callAllowance({ anonymous, operator, usedTodaySeconds, balanceMicros = 0 }, country) {
	if (operator) return { limit: MAX_CALL_SECONDS, free: MAX_CALL_SECONDS };
	const free = isFreeCountry(country) ? freeSecondsLeft({ anonymous, operator, usedTodaySeconds }) : 0;
	const paid = Math.floor(Math.max(0, balanceMicros) / maxMicrosPerMinute(country)) * 60;
	const limit = Math.min(MAX_CALL_SECONDS, free + paid);
	return { limit: limit >= MIN_CALL_SECONDS ? limit : 0, free: Math.min(free, limit) };
}

/** Kept for the free-only callers: seconds the next US/Canada call may last. */
export const callLimitSeconds = (account) => callAllowance(account, 'US').limit;

/** Billable seconds of a connected call: from answer to hang-up, rounded up. */
export function billableSeconds(answeredAt, endedAt) {
	if (!answeredAt || !endedAt) return 0;
	const ms = Date.parse(endedAt) - Date.parse(answeredAt);
	return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Started minutes of a call. */
export const startedMinutes = (seconds) => (seconds > 0 ? Math.ceil(seconds / 60) : 0);

/** What a US/Canada call costs past its free seconds (micro-dollars). */
export function usCaChargeMicros(billedSeconds, freeAllowance) {
	const paid = Math.max(0, billedSeconds - Math.min(billedSeconds, Math.max(0, freeAllowance)));
	return startedMinutes(paid) * US_CA_MICROS_PER_MINUTE;
}

/** What an international call costs the caller: twice the carrier's cost (USD), rounded up. */
// Whole micro-dollars first: 2 * 0.0072 * 1e6 is 14400.000000000002 in floating point.
export const intlChargeMicros = (carrierCostUsd) => 2 * Math.round(Math.max(0, Number(carrierCostUsd) || 0) * 1e6);

/** 1234567 -> "$1.23" */
export const formatMoney = (micros) => `$${(Math.floor(Math.max(0, micros) / 10_000) / 100).toFixed(2)}`;

/** +14085550199 -> (408) 555-0199; others in international format. */
export function formatNumber(e164) {
	const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(e164 || ''));
	if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
	const p = parsePhoneNumberFromString(String(e164 || ''));
	return p ? p.formatInternational() : String(e164 || '');
}

export { countryName };
