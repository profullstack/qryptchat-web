import { beforeEach, describe, expect, it, vi } from 'vitest';

const pq = vi.hoisted(() => ({
	initialize: vi.fn(async () => {}),
	exportUserKeys: vi.fn(async () => ({
		keys1024: { publicKey: 'cGsxMDI0', privateKey: 'U0VDUkVUc2sxMDI0', algorithm: 'ML-KEM-1024' },
		keys768: { publicKey: 'cGs3Njg=', privateKey: 'U0VDUkVUc2s3Njg=', algorithm: 'ML-KEM-768' }
	})),
	clearUserKeys: vi.fn(async () => {}),
	importUserKeys: vi.fn(async () => {})
}));
vi.mock('./post-quantum-encryption.js', () => ({ postQuantumEncryption: pq }));

const { privateKeyManager } = await import('./private-key-manager.js');

const AUTH_ID = '8f4b6316-0000-4000-8000-000000000002';
const PASS = 'violet kettle under seven moons';
const b64url = (o) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOKEN = `h.${b64url({ sub: AUTH_ID })}.s`;

describe('server key backup in the browser (seal v2)', () => {
	let stored;
	let requests;

	beforeEach(() => {
		vi.clearAllMocks();
		stored = null;
		requests = [];
		vi.spyOn(privateKeyManager, '_syncPublicKeyToDatabase').mockResolvedValue(undefined);
		globalThis.fetch = vi.fn(async (url, init = {}) => {
			const body = init.body ? JSON.parse(init.body) : undefined;
			requests.push({ method: init.method ?? 'GET', body, raw: init.body ?? '' });
			if (init.method === 'PUT') {
				stored = body.encrypted_keys;
				return new Response(JSON.stringify({ success: true, seal_version: 2 }), { status: 200 });
			}
			if (init.method === 'POST') {
				return new Response(
					JSON.stringify({ backup: { encrypted_keys: stored, seal_version: 2 }, user_id: AUTH_ID, legacy: false }),
					{ status: 200 }
				);
			}
			return new Response('{}', { status: 404 });
		});
	});

	it('seals in the browser: the server receives neither the passphrase, the recovery key nor a private key', async () => {
		const { recoveryKey } = await privateKeyManager.backupKeysToServer(PASS, { accessToken: TOKEN });
		expect(recoveryKey).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/);
		const [put] = requests;
		expect(put.method).toBe('PUT');
		expect(put.raw).not.toContain(PASS);
		expect(put.raw).not.toContain(recoveryKey);
		expect(put.raw).not.toContain('U0VDUkVUc2s');
		expect(put.body.pin).toBeUndefined();
		expect(JSON.parse(stored)).toMatchObject({ format: 'qrypt-key-backup', version: 2 });
	});

	it('refuses a PIN as the backup secret', async () => {
		await expect(privateKeyManager.backupKeysToServer('482193', { accessToken: TOKEN })).rejects.toThrow();
		expect(requests).toHaveLength(0);
	});

	it('restores with the passphrase or the recovery key without sending either', async () => {
		const { recoveryKey } = await privateKeyManager.backupKeysToServer(PASS, { accessToken: TOKEN });
		for (const secret of [PASS, recoveryKey]) {
			requests.length = 0;
			pq.importUserKeys.mockClear();
			const result = await privateKeyManager.restoreKeysFromServer(secret, { accessToken: TOKEN });
			expect(result).toEqual({ legacy: false });
			expect(requests[0].method).toBe('POST');
			expect(requests[0].body).toEqual({});
			expect(pq.importUserKeys).toHaveBeenCalledWith('cGsxMDI0', 'U0VDUkVUc2sxMDI0', 'ML-KEM-1024');
		}
	});

	it('fails cleanly on a wrong passphrase and imports nothing', async () => {
		await privateKeyManager.backupKeysToServer(PASS, { accessToken: TOKEN });
		await expect(
			privateKeyManager.restoreKeysFromServer('violet kettle under six moons', { accessToken: TOKEN })
		).rejects.toThrow(/Wrong passphrase/);
		expect(pq.clearUserKeys).not.toHaveBeenCalled();
	});
});
