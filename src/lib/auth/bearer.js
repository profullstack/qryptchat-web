/**
 * The access token from an `Authorization: Bearer …` header, or null.
 *
 * qc, the MCP server and API clients authenticate this way, and so do browser
 * sessions that never get a cookie (passkey, CoinPay, phone). Routes with
 * their own cookie parsing must check this first.
 * @param {Request} request
 * @returns {string | null}
 */
export function bearerToken(request) {
	const header = request?.headers?.get?.('authorization');
	if (typeof header !== 'string') return null;
	const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
	return token || null;
}
