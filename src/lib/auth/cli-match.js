/**
 * The confirmation code `qc login` prints and /cli/authorize shows: eight
 * characters derived from the PKCE challenge and the CLI's ephemeral key. If
 * they differ, the page is approving someone else's terminal. Works in the
 * browser and in Node/Bun (both have WebCrypto).
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** @param {string} challenge @param {string} kemPublicKey */
export async function matchCode(challenge, kemPublicKey) {
	const bytes = new Uint8Array(
		await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`qc-login\n${challenge}\n${kemPublicKey}`))
	);
	let out = '';
	for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
	return `${out.slice(0, 4)}-${out.slice(4)}`;
}
