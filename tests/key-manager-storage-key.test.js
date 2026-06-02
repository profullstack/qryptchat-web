import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Base64 } from '../src/lib/crypto/index.js';
import { KeyManager } from '../src/lib/crypto/key-manager.js';
import { indexedDBManager } from '../src/lib/crypto/indexed-db-manager.js';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('../src/lib/crypto/indexed-db-manager.js', () => {
	const db = new Map();
	return {
		indexedDBManager: {
			get: vi.fn(async (id) => db.get(id) || null),
			set: vi.fn(async (id, value) => {
				db.set(id, value);
			}),
			clearForTesting: () => db.clear()
		}
	};
});

const createStorageMock = () => {
	const store = {};
	return {
		getItem: vi.fn((key) => (key in store ? store[key] : null)),
		setItem: vi.fn((key, value) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			for (const key of Object.keys(store)) {
				delete store[key];
			}
		})
	};
};

describe('KeyManager storage encryption key hardening', () => {
	let keyManager;
	let generateKeySpy;
	let importKeySpy;

	beforeEach(() => {
		keyManager = new KeyManager();

		global.localStorage = createStorageMock();
		global.sessionStorage = createStorageMock();

		indexedDBManager.clearForTesting();
		indexedDBManager.get.mockClear();
		indexedDBManager.set.mockClear();

		generateKeySpy = vi
			.spyOn(globalThis.crypto.subtle, 'generateKey')
			.mockResolvedValue({ id: 'generated-storage-key' });
		importKeySpy = vi
			.spyOn(globalThis.crypto.subtle, 'importKey')
			.mockResolvedValue({ id: 'migrated-storage-key' });
	});

	it('stores new storage encryption key as non-extractable key handle in IndexedDB', async () => {
		const storageKey = await keyManager._getStorageEncryptionKey();

		expect(storageKey).toEqual({ id: 'generated-storage-key' });
		expect(generateKeySpy).toHaveBeenCalledWith(
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
		expect(indexedDBManager.set).toHaveBeenCalledWith('qryptchat_storage_enc_key', storageKey);
		expect(localStorage.getItem('qryptchat_storage_enc_key')).toBeNull();
	});

	it('migrates legacy Base64 key from localStorage into non-extractable IndexedDB key handle', async () => {
		const legacyKeyBytes = new Uint8Array(32).fill(7);
		localStorage.setItem('qryptchat_storage_enc_key', Base64.encode(legacyKeyBytes));

		const storageKey = await keyManager._getStorageEncryptionKey();

		expect(storageKey).toEqual({ id: 'migrated-storage-key' });
		expect(importKeySpy).toHaveBeenCalledWith(
			'raw',
			legacyKeyBytes,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
		expect(indexedDBManager.set).toHaveBeenCalledWith('qryptchat_storage_enc_key', storageKey);
		expect(localStorage.getItem('qryptchat_storage_enc_key')).toBeNull();
	});

	it('migrates legacy Base64 key from sessionStorage into non-extractable IndexedDB key handle', async () => {
		const legacyKeyBytes = new Uint8Array(32).fill(9);
		sessionStorage.setItem('qryptchat_storage_enc_key', Base64.encode(legacyKeyBytes));

		const storageKey = await keyManager._getStorageEncryptionKey();

		expect(storageKey).toEqual({ id: 'migrated-storage-key' });
		expect(importKeySpy).toHaveBeenCalledWith(
			'raw',
			legacyKeyBytes,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt', 'decrypt']
		);
		expect(indexedDBManager.set).toHaveBeenCalledWith('qryptchat_storage_enc_key', storageKey);
		expect(sessionStorage.getItem('qryptchat_storage_enc_key')).toBeNull();
	});
});
