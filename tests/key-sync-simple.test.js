/**
 * @fileoverview Simple test for key synchronization functionality
 * Tests the basic flow of key sync service
 */

import { describe, it, expect } from 'vitest';

describe('Key Sync Service', () => {
	it('should export the key sync service', async () => {
		const { keySyncService } = await import('../src/lib/crypto/key-sync-service.js');
		
		expect(keySyncService).to.be.an('object');
		expect(keySyncService.syncPublicKey).to.be.a('function');
		expect(keySyncService.autoSyncOnLogin).to.be.a('function');
		expect(keySyncService.needsKeySync).to.be.a('function');
		expect(keySyncService.forceSyncPublicKey).to.be.a('function');
	});

	it('should handle missing browser environment gracefully', async () => {
		const { keySyncService } = await import('../src/lib/crypto/key-sync-service.js');
		
		// Test sync without browser environment
		const result = await keySyncService.syncPublicKey();
		
		expect(result.success).to.be.false;
		expect(result.error).to.equal('Not in browser environment');
	});

	it('should handle missing user gracefully', async () => {
		const { keySyncService } = await import('../src/lib/crypto/key-sync-service.js');
		
		// Mock browser environment
		global.window = { crypto: { getRandomValues: () => {} } };
		global.localStorage = {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {}
		};
		
		try {
			const result = await keySyncService.needsKeySync();
			expect(result).to.be.false; // Should return false when no user
		} finally {
			// Clean up
			delete global.window;
			delete global.localStorage;
		}
	});
});

describe('Auth Store Integration', () => {
	it('should import auth store with key sync integration', async () => {
		const { auth } = await import('../src/lib/stores/auth.js');
		
		expect(auth).to.be.an('object');
		expect(auth.subscribe).to.be.a('function');
		expect(auth.verifySMS).to.be.a('function');
		expect(auth.init).to.be.a('function');
	});
});