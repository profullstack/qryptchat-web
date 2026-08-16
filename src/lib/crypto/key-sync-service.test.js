import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getPublicKey: vi.fn(),
	initialize: vi.fn()
}));

vi.mock('./post-quantum-encryption.js', () => ({
	postQuantumEncryption: {
		get isInitialized() {
			return true;
		},
		initialize: mocks.initialize,
		getPublicKey: mocks.getPublicKey
	}
}));

const LOCAL_KEY = 'local-public-key-aaaa';
const INTERNAL_ID = '4826dea7-225a-45df-a56f-6f380bd74ecf';

describe('keySyncService.needsKeySync', () => {
	let keySyncService;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		mocks.getPublicKey.mockResolvedValue(LOCAL_KEY);
		// tests/setup.js replaces localStorage with a mock that does not actually store,
		// so the value has to be handed back through getItem rather than written.
		window.localStorage.getItem.mockReturnValue(JSON.stringify({ id: INTERNAL_ID }));
		({ keySyncService } = await import('./key-sync-service.js'));
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** @param {{ok?: boolean, body?: any}} res */
	function stubFetch(res) {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: res.ok ?? true,
			json: async () => res.body
		});
		vi.stubGlobal('fetch', fetchMock);
		return fetchMock;
	}

	// The bug: the old code read `data.public_keys[internalId]` off an endpoint that
	// returns an array keyed by auth id, so it reported "not found" every login and
	// re-published the local key over whatever was already there.
	it('does not re-publish when the stored key already matches', async () => {
		const fetchMock = stubFetch({ body: { public_key: LOCAL_KEY } });

		await expect(keySyncService.needsKeySync()).resolves.toBe(false);

		// Asks for its own key by internal id; the server resolves the identity domain.
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain(`user_id=${INTERNAL_ID}`);
		expect(fetchMock.mock.calls[0][0]).not.toContain('/all');
	});

	it('syncs when the database holds no key', async () => {
		stubFetch({ body: { public_key: null } });
		await expect(keySyncService.needsKeySync()).resolves.toBe(true);
	});

	it('syncs when the stored key belongs to a different keypair', async () => {
		stubFetch({ body: { public_key: 'some-other-key-bbbb' } });
		await expect(keySyncService.needsKeySync()).resolves.toBe(true);
	});

	// Publishing replaces the key everyone encrypts to, so an unknown answer must not
	// be treated as "the database has nothing".
	it('leaves the published key alone when the check cannot be completed', async () => {
		stubFetch({ ok: false, body: {} });
		await expect(keySyncService.needsKeySync()).resolves.toBe(false);

		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		await expect(keySyncService.needsKeySync()).resolves.toBe(false);
	});

	it('does nothing without local keys', async () => {
		mocks.getPublicKey.mockResolvedValue(null);
		await expect(keySyncService.needsKeySync()).resolves.toBe(false);
	});
});
