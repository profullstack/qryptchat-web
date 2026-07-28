const MAX_WEBHOOK_URL_LENGTH = 2048;

/**
 * Validate outbound webhook destinations before they are later fetched by the
 * server-side dispatcher.
 *
 * @param {string} value
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
export function validateWebhookUrl(value) {
	if (typeof value !== 'string' || value.trim().length === 0) {
		return { ok: false, error: 'url is required' };
	}

	const input = value.trim();
	if (input.length > MAX_WEBHOOK_URL_LENGTH) {
		return { ok: false, error: 'Webhook URL is too long' };
	}

	let parsed;
	try {
		parsed = new URL(input);
	} catch {
		return { ok: false, error: 'Invalid URL' };
	}

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		return { ok: false, error: 'Webhook URL must use http or https' };
	}

	if (isBlockedHostname(parsed.hostname)) {
		return { ok: false, error: 'Webhook URL must point to a public host' };
	}

	return { ok: true, url: parsed.toString() };
}

function isBlockedHostname(hostname) {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

	if (
		host === 'localhost' ||
		host === '0.0.0.0' ||
		host.endsWith('.localhost') ||
		host.endsWith('.local')
	) {
		return true;
	}

	const ipv4 = parseIpv4(host);
	if (ipv4) return isPrivateIpv4(ipv4);

	return isPrivateIpv6(host);
}

function parseIpv4(host) {
	const parts = host.split('.');
	if (parts.length !== 4) return null;

	const octets = parts.map((part) => {
		if (!/^(0|[1-9]\d{0,2})$/.test(part)) return Number.NaN;
		const value = Number(part);
		return value >= 0 && value <= 255 ? value : Number.NaN;
	});

	return octets.every(Number.isInteger) ? octets : null;
}

function isPrivateIpv4([a, b]) {
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function isPrivateIpv6(host) {
	const normalized = host.toLowerCase();
	const mappedIpv4 = parseIpv4MappedIpv6(normalized);
	if (mappedIpv4) return isPrivateIpv4(mappedIpv4);

	return (
		normalized === '::' ||
		normalized === '::1' ||
		normalized.startsWith('fe80:') ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd')
	);
}

function parseIpv4MappedIpv6(host) {
	if (!host.startsWith('::ffff:')) return null;

	const mapped = host.slice('::ffff:'.length);
	const dotted = parseIpv4(mapped);
	if (dotted) return dotted;

	const parts = mapped.split(':');
	if (parts.length !== 2) return null;

	const words = parts.map((part) => {
		if (!/^[0-9a-f]{1,4}$/i.test(part)) return Number.NaN;
		return Number.parseInt(part, 16);
	});

	if (!words.every(Number.isInteger)) return null;

	const [high, low] = words;
	return [high >> 8, high & 255, low >> 8, low & 255];
}
