/**
 * Where qc keeps its session and keys: $QC_HOME, else $XDG_CONFIG_HOME/qc,
 * else ~/.config/qc. The directory is 0700 and session.json is 0600, written
 * atomically (temp file + rename) so a crash never leaves half a key on disk.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dataKey, seal, unseal } from './vault.js';

export const DEFAULT_URL = 'https://qrypt.chat';

export function configDir(env = process.env) {
	if (env.QC_HOME) return env.QC_HOME;
	return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'qc');
}

export const sessionPath = (env = process.env) => join(configDir(env), 'session.json');

/** The server qc talks to: $QC_URL, else the one the session was made on, else qrypt.chat. */
export function baseUrl(session, env = process.env) {
	return (env.QC_URL || session?.base || DEFAULT_URL).replace(/\/+$/, '');
}

/** The session file as stored: v2 (sealed) or a v1 plaintext one from qc 0.1/0.2. */
export function loadSession(env = process.env) {
	try {
		const file = JSON.parse(readFileSync(sessionPath(env), 'utf8'));
		if (file?.v === 2 && file.sealed && file.user) return file;
		return file && file.access_token && file.keys ? file : null;
	} catch {
		return null;
	}
}

function writeFile(obj, env) {
	const dir = configDir(env);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(dir, 0o700);
	} catch {
		// not ours to change (e.g. a shared mount); the file mode still holds
	}
	const file = sessionPath(env);
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
	renameSync(tmp, file);
}

const accountOf = (session) => String(session.user?.id || session.user?.username || 'default');

/**
 * Open the stored session: { session, save } where save() re-seals under the
 * same key (token refresh never asks again). A v1 plaintext file is sealed on
 * the spot, so no private key stays readable on disk past first use.
 */
export async function unlockSession(env = process.env, opts = {}) {
	const file = loadSession(env);
	if (!file) return null;
	const existing = file.v === 2 ? file.sealed : undefined;
	const { key, source } = await dataKey(accountOf(file), { existing, env, ...opts });
	const session = file.v === 2 ? unseal(file, key) : file;
	const save = (s) => writeFile(seal(s, key, source), env);
	if (file.v !== 2) save(session);
	return { session, save };
}

/** Seal and store a brand-new session (after qc login); returns save() for it. */
export async function storeSession(session, env = process.env, opts = {}) {
	const { key, source } = await dataKey(accountOf(session), { env, ...opts });
	const save = (s) => writeFile(seal(s, key, source), env);
	save(session);
	return save;
}

export function clearSession(env = process.env) {
	const file = sessionPath(env);
	if (existsSync(file)) rmSync(file);
}
