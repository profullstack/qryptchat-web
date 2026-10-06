import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seal, unseal, deriveKey, dataKey } from '../../src/cli/vault.js';
import { loadSession, storeSession, unlockSession, sessionPath } from '../../src/cli/config.js';

const session = {
	base: 'https://qrypt.chat',
	user: { id: 'u1', username: 'anthony' },
	access_token: 'ACCESS-SECRET',
	refresh_token: 'REFRESH-SECRET',
	expires_at: 123,
	keys: { keys1024: { publicKey: 'PUB', privateKey: 'PRIVATE-KEY-SECRET' } },
};

let home;
let env;
beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'qc-vault-'));
	env = { QC_HOME: home, QC_NO_KEYCHAIN: '1' };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const onDisk = () => readFileSync(sessionPath(env), 'utf8');
const noSecrets = (text) => ['ACCESS-SECRET', 'REFRESH-SECRET', 'PRIVATE-KEY-SECRET', 'PUB'].every((s) => !text.includes(s));

describe('sealing', () => {
	it('round-trips, and a wrong key fails loudly', () => {
		const salt = 'c2FsdHNhbHRzYWx0c2FsdA==';
		const file = seal(session, deriveKey('correct horse', salt), { kind: 'passphrase', salt });
		expect(file.v).toBe(2);
		expect(file.user).toEqual(session.user);
		expect(noSecrets(JSON.stringify(file))).toBe(true);
		expect(unseal(file, deriveKey('correct horse', salt))).toEqual(session);
		expect(() => unseal(file, deriveKey('wrong', salt))).toThrow(/Wrong passphrase/);
	});
});

describe('the session file', () => {
	it('is sealed when stored, readable for whoami, and unlocks with the passphrase', async () => {
		await storeSession(session, { ...env, QC_PASSPHRASE: 'pass phrase 1' });
		expect(noSecrets(onDisk())).toBe(true);
		expect(loadSession(env).user.username).toBe('anthony');
		const { session: opened } = await unlockSession({ ...env, QC_PASSPHRASE: 'pass phrase 1' });
		expect(opened.keys.keys1024.privateKey).toBe('PRIVATE-KEY-SECRET');
		await expect(unlockSession({ ...env, QC_PASSPHRASE: 'nope' })).rejects.toThrow(/Wrong passphrase/);
	});

	it('re-seals refreshed tokens under the same key', async () => {
		const save = await storeSession(session, { ...env, QC_PASSPHRASE: 'pass phrase 1' });
		save({ ...session, access_token: 'NEW-ACCESS' });
		expect(onDisk()).not.toContain('NEW-ACCESS');
		const { session: opened } = await unlockSession({ ...env, QC_PASSPHRASE: 'pass phrase 1' });
		expect(opened.access_token).toBe('NEW-ACCESS');
	});

	it('seals a plaintext session from qc 0.1/0.2 on first use', async () => {
		writeFileSync(sessionPath(env), JSON.stringify(session));
		expect(onDisk()).toContain('PRIVATE-KEY-SECRET');
		const { session: opened } = await unlockSession({ ...env, QC_PASSPHRASE: 'upgrade me' });
		expect(opened.refresh_token).toBe('REFRESH-SECRET');
		expect(noSecrets(onDisk())).toBe(true);
		expect(JSON.parse(onDisk()).v).toBe(2);
	});

	it('uses the keychain when there is one, and asks nothing', async () => {
		const store = new Map();
		const chain = { get: (a) => store.get(a) ?? null, set: (a, v) => (store.set(a, v), true) };
		const ask = () => {
			throw new Error('should not prompt');
		};
		await storeSession(session, { QC_HOME: home }, { chain, ask });
		expect(store.has('u1')).toBe(true);
		expect(JSON.parse(onDisk()).sealed.source).toBe('keychain');
		const { session: opened } = await unlockSession({ QC_HOME: home }, { chain, ask });
		expect(opened.access_token).toBe('ACCESS-SECRET');
	});

	it('asks for a new passphrase twice and refuses short ones', async () => {
		const answers = ['short', 'long enough pass', 'long enough pass'];
		const { source } = await dataKey('u1', { env: {}, chain: null, ask: async () => answers.shift() });
		expect(source.kind).toBe('passphrase');
		expect(answers).toEqual([]);
	});
});
