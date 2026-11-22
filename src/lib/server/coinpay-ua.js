import pkg from '../../../package.json';

/**
 * User-Agent for server-side calls to CoinPay. Every fleet app shares one
 * public IP on dev2, so CoinPay's logs and throttle tell the apps apart by
 * this header instead of a bare `node`/`Next.js Middleware` agent.
 * No Node-only imports: the crawl gateway uses this inside the middleware.
 */
export const COINPAY_UA = `qrypt.chat/${pkg.version} (+https://qrypt.chat)`;

/** fetch that adds COINPAY_UA unless the caller already set a User-Agent. */
export const coinpayFetch = (input, init = {}) => {
	const headers = new Headers(init.headers);
	if (!headers.has('user-agent')) headers.set('user-agent', COINPAY_UA);
	return fetch(input, { ...init, headers });
};
