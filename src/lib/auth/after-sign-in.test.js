import { describe, expect, it } from 'vitest';
import { afterSignInPath, returnAfterSignIn } from './after-sign-in.js';

function memory() {
	const m = new Map();
	return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}

describe('after sign-in return path', () => {
	it('comes back to a qc login approval once, then goes to /chat', () => {
		const s = memory();
		returnAfterSignIn('/cli/authorize?code_challenge=abc&state=x', s);
		expect(afterSignInPath(s)).toBe('/cli/authorize?code_challenge=abc&state=x');
		expect(afterSignInPath(s)).toBe('/chat');
	});

	it('refuses anything that is not our own approval page', () => {
		const s = memory();
		for (const p of ['https://evil.example/cli/authorize?x', '//evil.example/x', '/settings', '/cli/authorize']) {
			returnAfterSignIn(p, s);
			expect(afterSignInPath(s)).toBe('/chat');
		}
	});
});
