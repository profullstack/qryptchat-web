/**
 * Where qc keeps its session and keys: $QC_HOME, else $XDG_CONFIG_HOME/qc,
 * else ~/.config/qc. The directory is 0700 and session.json is 0600, written
 * atomically (temp file + rename) so a crash never leaves half a key on disk.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

export function loadSession(env = process.env) {
	try {
		const session = JSON.parse(readFileSync(sessionPath(env), 'utf8'));
		return session && session.access_token && session.keys ? session : null;
	} catch {
		return null;
	}
}

export function saveSession(session, env = process.env) {
	const dir = configDir(env);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	try {
		chmodSync(dir, 0o700);
	} catch {
		// not ours to change (e.g. a shared mount); the file mode still holds
	}
	const file = sessionPath(env);
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
	renameSync(tmp, file);
}

export function clearSession(env = process.env) {
	const file = sessionPath(env);
	if (existsSync(file)) rmSync(file);
}
