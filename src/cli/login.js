/**
 * `qc login`: OAuth 2.1 authorization code + PKCE, started here.
 *
 * qc listens on a loopback port, opens qrypt.chat/cli/authorize in the browser
 * with an S256 challenge and a one-time ML-KEM-1024 public key, and waits.
 * Approving in the browser seals the account's keys to that public key and
 * redirects back with a code; qc trades code + verifier for its own session
 * and opens the keys. With --oob (or over SSH with no display) there is no
 * loopback: the page shows the code and you paste it here.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { baseUrl, storeSession } from './config.js';
import { ephemeralKeypair, openKeyBlob } from './crypto.js';
import { matchCode } from '../lib/auth/cli-match.js';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const TIMEOUT_MS = 5 * 60 * 1000;

const PAGE = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;background:#0b0d12;color:#e6e8ee}main{max-width:28rem;text-align:center}</style>
<main><h1>${title}</h1><p>${body}</p></main>`;

/** Open a URL in the default browser; false when there is nothing to open it with. */
/**
 * True when no browser can come back to this machine: an SSH session with no
 * display, or QC_NO_BROWSER. A loopback redirect would then land on the
 * browser's OWN 127.0.0.1 (your laptop), where nothing is listening.
 */
export function isRemote({ platform = process.platform, env = process.env } = {}) {
	if (env.QC_NO_BROWSER) return true;
	return !!(env.SSH_CONNECTION || env.SSH_TTY) && !env.DISPLAY && !env.WAYLAND_DISPLAY && platform !== 'darwin' && platform !== 'win32';
}

/**
 * A code from what the user pasted: the URL the browser ended up on
 * (…/callback?code=…&state=…) or the bare code. A URL whose state does not
 * match this login is refused.
 */
export function parsePasted(input, state) {
	const text = String(input || '').trim();
	if (!text) return null;
	if (/^https?:\/\//i.test(text)) {
		let url;
		try {
			url = new URL(text);
		} catch {
			return null;
		}
		const got = url.searchParams.get('state');
		if (got && got !== state) throw new Error('That link belongs to a different login. Run qc login again.');
		return url.searchParams.get('code');
	}
	return /^[A-Za-z0-9_-]{20,}$/.test(text) ? text : null;
}

export function openBrowser(url, { platform = process.platform, env = process.env } = {}) {
	if (isRemote({ platform, env })) return false;
	const [cmd, args] =
		platform === 'darwin' ? ['open', [url]] : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
	try {
		const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
		child.on('error', () => {});
		child.unref();
		return true;
	} catch {
		return false;
	}
}

function waitForCallback(server, state) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Timed out waiting for the browser (5 minutes). Run qc login again.')), TIMEOUT_MS);
		server.on('request', (req, res) => {
			const url = new URL(req.url, 'http://127.0.0.1');
			if (url.pathname !== '/callback') {
				res.writeHead(404).end();
				return;
			}
			const done = (status, title, body) => {
				res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }).end(PAGE(title, body));
			};
			if (url.searchParams.get('state') !== state) {
				done(400, 'That was not this login', 'The state did not match. Go back to your terminal.');
				return; // keep waiting for the real one
			}
			clearTimeout(timer);
			const error = url.searchParams.get('error');
			if (error) {
				done(200, 'Not approved', 'Nothing was shared. You can close this tab.');
				reject(new Error(error === 'access_denied' ? 'Login was denied in the browser.' : `Login failed: ${error}`));
				return;
			}
			done(200, 'Signed in', 'You can close this tab and go back to your terminal.');
			resolve(url.searchParams.get('code'));
		});
	});
}

/**
 * @param {{ base?: string, oob?: boolean, print?: (line: string) => void, env?: NodeJS.ProcessEnv }} [options]
 */
export async function login(options = {}) {
	const env = options.env ?? process.env;
	const print = options.print ?? ((line) => process.stderr.write(`${line}\n`));
	const base = (options.base ?? baseUrl(null, env)).replace(/\/+$/, '');

	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	const state = b64url(randomBytes(16));
	const ephemeral = await ephemeralKeypair();

	let server;
	let redirectUri = 'oob';
	// Over SSH the browser is on another machine: a loopback redirect cannot reach us.
	const oob = options.oob || isRemote({ env });
	if (!oob) {
		server = createServer();
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
	}

	const url = new URL('/cli/authorize', base);
	for (const [k, v] of Object.entries({
		response_type: 'code',
		code_challenge: challenge,
		code_challenge_method: 'S256',
		redirect_uri: redirectUri,
		state,
		client_name: `qc on ${hostname()}`,
		kem: ephemeral.publicKey,
	})) {
		url.searchParams.set(k, v);
	}

	const match = await matchCode(challenge, ephemeral.publicKey);
	print('');
	print(`  Confirmation code: ${match}`);
	print('  Check that the browser shows the same code before you approve.');
	print('');
	const opened = !oob && openBrowser(url.toString(), { env });
	print(opened ? '  Opened your browser. If it did not, open:' : '  Open this link in a browser where you are signed in to qrypt.chat:');
	print(`  ${url.toString()}`);
	print('');

	let code;
	let rl;
	try {
		if (server) {
			// The redirect normally comes straight back. If the browser is somewhere
			// else after all, the page it lands on (or the code) can be pasted here.
			const waits = [waitForCallback(server, state)];
			if (process.stdin.isTTY) {
				rl = createInterface({ input: process.stdin, output: process.stderr });
				waits.push(
					(async () => {
						for (;;) {
							let line;
							try {
								line = await rl.question('  Waiting for the browser… or paste the URL it ended up on: ');
							} catch {
								return new Promise(() => {}); // prompt closed: the callback won
							}
							const pasted = parsePasted(line, state);
							if (pasted) return pasted;
							print('  That is not a qc login code or callback URL.');
						}
					})(),
				);
			}
			code = await Promise.race(waits);
		} else {
			rl = createInterface({ input: process.stdin, output: process.stderr });
			for (;;) {
				code = parsePasted(await rl.question('  Paste the code (or the URL) from the browser: '), state);
				if (code) break;
				print('  That is not a qc login code.');
			}
		}
	} finally {
		rl?.close();
		server?.close();
	}
	if (!code) throw new Error('No code came back from the browser.');

	const res = await fetch(`${base}/api/cli/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }),
	});
	const token = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(token.error_description || token.error || `Sign-in failed (HTTP ${res.status})`);

	const keys = await openKeyBlob(token.key_blob, ephemeral);
	const session = {
		base,
		access_token: token.access_token,
		refresh_token: token.refresh_token,
		expires_at: token.expires_at,
		user: token.user,
		keys,
		created_at: new Date().toISOString(),
	};
	// Sealed before anything touches disk: keys and tokens are never plaintext at rest.
	const save = await storeSession(session, env, options.vault);
	return { session, save };
}
