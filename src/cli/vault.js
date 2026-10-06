/**
 * qc's session at rest: sealed, never plaintext.
 *
 * session.json (v2) keeps only what `qc whoami` needs in the clear (the server
 * and who you are). The tokens and BOTH private keypairs live in `sealed`,
 * ChaCha20-Poly1305 under a 32-byte data key that comes from, in order:
 *
 *   QC_PASSPHRASE        scrypt(passphrase, salt): for scripts and `qc mcp`
 *   the OS keychain      a random key in macOS Keychain or libsecret
 *                        (secret-tool), so a desktop never asks
 *   a passphrase prompt  scrypt again, asked once per run on a terminal
 *
 * A v1 (plaintext) session from qc 0.1/0.2 is sealed the first time it is used.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

export const SERVICE = 'qrypt-qc';
const SCRYPT = { N: 1 << 16, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const SECRET_FIELDS = ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'keys'];

const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

export function deriveKey(passphrase, salt) {
	return new Uint8Array(scryptSync(String(passphrase).normalize('NFKC'), Buffer.from(salt), 32, SCRYPT));
}

/** Seal the secret half of a session; returns the v2 file object. */
export function seal(session, key, source) {
	const secret = {};
	const open = {};
	for (const [k, v] of Object.entries(session)) (SECRET_FIELDS.includes(k) ? secret : open)[k] = v;
	// Plain Uint8Arrays: noble refuses a Buffer from another realm (jsdom, some bundlers).
	const nonce = Uint8Array.from(randomBytes(12));
	const ct = chacha20poly1305(Uint8Array.from(key), nonce).encrypt(Uint8Array.from(Buffer.from(JSON.stringify(secret), 'utf8')));
	return { v: 2, ...open, sealed: { alg: 'chacha20-poly1305', source: source.kind, ...(source.salt ? { salt: source.salt } : {}), nonce: b64(nonce), ct: b64(ct) } };
}

/** Open a v2 file object with its data key; throws on a wrong key. */
export function unseal(file, key) {
	const { nonce, ct } = file.sealed;
	let plain;
	try {
		plain = chacha20poly1305(Uint8Array.from(key), unb64(nonce)).decrypt(unb64(ct));
	} catch {
		throw new Error('Wrong passphrase, or the session was tampered with.');
	}
	const { v, sealed, ...open } = file;
	return { ...open, ...JSON.parse(Buffer.from(plain).toString('utf8')) };
}

// ---- OS keychain ----------------------------------------------------------

function run(cmd, args, input) {
	try {
		const r = spawnSync(cmd, args, { input, encoding: 'utf8', timeout: 10_000 });
		return r.status === 0 ? { ok: true, out: (r.stdout || '').trim() } : { ok: false };
	} catch {
		return { ok: false };
	}
}

/** The platform keychain, or null when there is none usable here. */
export function keychain({ platform = process.platform, env = process.env } = {}) {
	if (env.QC_NO_KEYCHAIN) return null;
	if (platform === 'darwin') {
		return {
			get: (account) => {
				const r = run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w']);
				return r.ok && r.out ? r.out : null;
			},
			set: (account, secret) => run('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', secret]).ok,
		};
	}
	if (platform === 'linux' && (env.DBUS_SESSION_BUS_ADDRESS || env.DISPLAY || env.WAYLAND_DISPLAY) && run('secret-tool', ['--version']).ok !== false) {
		const probe = spawnSync('which', ['secret-tool'], { encoding: 'utf8' });
		if (probe.status !== 0) return null;
		return {
			get: (account) => {
				const r = run('secret-tool', ['lookup', 'service', SERVICE, 'account', account]);
				return r.ok && r.out ? r.out : null;
			},
			set: (account, secret) => run('secret-tool', ['store', '--label', 'qc (qrypt.chat) session key', 'service', SERVICE, 'account', account], secret).ok,
		};
	}
	return null;
}

// ---- passphrase prompt ----------------------------------------------------

/** Ask on the terminal without echoing. */
export function askHidden(question) {
	return new Promise((resolve, reject) => {
		if (!process.stdin.isTTY) {
			reject(new Error('qc needs a passphrase to unlock your keys: set QC_PASSPHRASE, or run it on a terminal.'));
			return;
		}
		const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
		rl._writeToOutput = (s) => {
			if (s.includes(question)) process.stderr.write(s);
		};
		rl.question(question, (answer) => {
			rl.close();
			process.stderr.write('\n');
			resolve(answer);
		});
	});
}

/**
 * The data key for an account. `existing` is the sealed block of a session
 * already on disk (decides the source); without it a new key is set up.
 */
export async function dataKey(account, { existing, env = process.env, ask = askHidden, chain = keychain({ env }) } = {}) {
	if (existing) {
		if (existing.source === 'keychain') {
			const k = chain?.get(account);
			if (!k) throw new Error('Your session key is not in the keychain any more. Run qc login again.');
			return { key: unb64(k), source: { kind: 'keychain' } };
		}
		const pass = env.QC_PASSPHRASE ?? (await ask('  Passphrase for your qc keys: '));
		return { key: deriveKey(pass, existing.salt), source: { kind: 'passphrase', salt: existing.salt } };
	}
	if (env.QC_PASSPHRASE) {
		const salt = b64(randomBytes(16));
		return { key: deriveKey(env.QC_PASSPHRASE, salt), source: { kind: 'passphrase', salt } };
	}
	if (chain) {
		const raw = randomBytes(32);
		if (chain.set(account, b64(raw))) return { key: new Uint8Array(raw), source: { kind: 'keychain' } };
	}
	process.stderr.write('\n  qc keeps your keys encrypted. Choose a passphrase (you will need it each time qc starts).\n');
	for (;;) {
		const a = await ask('  New passphrase: ');
		if (a.length < 8) {
			process.stderr.write('  At least 8 characters, please.\n');
			continue;
		}
		const b = await ask('  Again: ');
		if (a !== b) {
			process.stderr.write('  Those did not match.\n');
			continue;
		}
		const salt = b64(randomBytes(16));
		return { key: deriveKey(a, salt), source: { kind: 'passphrase', salt } };
	}
}
