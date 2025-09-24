/**
 * @fileoverview Integration tests for key synchronization functionality
 * Tests the flow of generating keys during signup and syncing them to database
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { keySyncService } from '../src/lib/crypto/key-sync-service.js';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

// Mock fetch for testing
let mockFetch;
let originalFetch;

describe('Key Sync Integration', () => {
	beforeEach(async () => {
		// Store original fetch
		originalFetch = global.fetch;
		
		// Mock localStorage
		global.localStorage = {
			storage: {},
			getItem(key) {
				return this.storage[key] || null;
			},
			setItem(key, value) {
				this.storage[key] = value;
			},
			removeItem(key) {
				delete this.storage[key];
			},
			clear() {
				this.storage = {};
			}
		};

		// Mock browser environment
		global.window = {
			crypto: {
				getRandomValues: (arr) => {
					for (let i = 0; i < arr.length; i++) {
						arr[i] = Math.floor(Math.random() * 256);
					}
					return arr;
				}
			}
		};

		// Clear any existing state
		await postQuantumEncryption.clearUserKeys();
		localStorage.clear();
	});

	afterEach(() => {
		// Restore original fetch
		if (originalFetch) {
			global.fetch = originalFetch;
		}
		
		// Clean up globals
		delete global.localStorage;
		delete global.window;
	});

	describe('syncPublicKey', () => {
		it('should sync public key to database when user has local keys', async () => {
			// Mock successful API response
			mockFetch = global.fetch = async (url, options) => {
				if (url === '/api/crypto/public-keys' && options.method === 'PUT') {
					const body = JSON.parse(options.body);
					expect(body.public_key).to.be.a('string');
					expect(body.key_type).to.equal('ML-KEM-1024');
					
					return {
						ok: true,
						json: async () => ({
							success: true,
							message: 'Public key synced successfully'
						})
					};
				}
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption (this generates keys)
			await postQuantumEncryption.initialize();
			
			// Verify we have keys locally
			const publicKey = await postQuantumEncryption.getPublicKey();
			expect(publicKey).to.be.a('string');
			expect(publicKey.length).to.be.greaterThan(0);

			// Test sync
			const result = await keySyncService.syncPublicKey();
			
			expect(result.success).to.be.true;
		});

		it('should handle sync failure gracefully', async () => {
			// Mock failed API response
			mockFetch = global.fetch = async (url, options) => {
				if (url === '/api/crypto/public-keys' && options.method === 'PUT') {
					return {
						ok: false,
						status: 500,
						json: async () => ({
							error: 'Database error'
						})
					};
				}
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption
			await postQuantumEncryption.initialize();

			// Test sync failure
			const result = await keySyncService.syncPublicKey();
			
			expect(result.success).to.be.false;
			expect(result.error).to.include('HTTP 500');
		});

		it('should not sync if no local keys exist', async () => {
			// Don't initialize encryption, so no keys exist
			
			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Test sync without keys
			const result = await keySyncService.syncPublicKey();
			
			expect(result.success).to.be.false;
			expect(result.error).to.include('No public key available');
		});
	});

	describe('needsKeySync', () => {
		it('should return true when user has local keys but none in database', async () => {
			// Mock API response indicating no keys in database
			mockFetch = global.fetch = async (url) => {
				if (url === '/api/crypto/public-keys/all') {
					return {
						ok: true,
						json: async () => ({
							public_keys: {} // Empty - no keys in database
						})
					};
				}
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption (generates local keys)
			await postQuantumEncryption.initialize();

			// Test needs sync check
			const needsSync = await keySyncService.needsKeySync();
			
			expect(needsSync).to.be.true;
		});

		it('should return false when user has keys both locally and in database', async () => {
			// Mock API response indicating keys exist in database
			mockFetch = global.fetch = async (url) => {
				if (url === '/api/crypto/public-keys/all') {
					return {
						ok: true,
						json: async () => ({
							public_keys: {
								'test-user-123': 'mock-public-key-data'
							}
						})
					};
				}
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption
			await postQuantumEncryption.initialize();

			// Test needs sync check
			const needsSync = await keySyncService.needsKeySync();
			
			expect(needsSync).to.be.false;
		});

		it('should return false when user has no local keys', async () => {
			// Don't initialize encryption, so no local keys exist
			
			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Test needs sync check
			const needsSync = await keySyncService.needsKeySync();
			
			expect(needsSync).to.be.false;
		});
	});

	describe('autoSyncOnLogin', () => {
		it('should sync keys when needed', async () => {
			let syncCalled = false;
			
			// Mock API responses
			mockFetch = global.fetch = async (url, options) => {
				if (url === '/api/crypto/public-keys/all') {
					return {
						ok: true,
						json: async () => ({
							public_keys: {} // No keys in database
						})
					};
				}
				
				if (url === '/api/crypto/public-keys' && options.method === 'PUT') {
					syncCalled = true;
					return {
						ok: true,
						json: async () => ({
							success: true,
							message: 'Public key synced successfully'
						})
					};
				}
				
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption
			await postQuantumEncryption.initialize();

			// Test auto-sync
			const result = await keySyncService.autoSyncOnLogin();
			
			expect(result.success).to.be.true;
			expect(syncCalled).to.be.true;
		});

		it('should skip sync when not needed', async () => {
			let syncCalled = false;
			
			// Mock API responses
			mockFetch = global.fetch = async (url, options) => {
				if (url === '/api/crypto/public-keys/all') {
					return {
						ok: true,
						json: async () => ({
							public_keys: {
								'test-user-123': 'existing-key-data'
							}
						})
					};
				}
				
				if (url === '/api/crypto/public-keys' && options.method === 'PUT') {
					syncCalled = true;
					return {
						ok: true,
						json: async () => ({
							success: true,
							message: 'Public key synced successfully'
						})
					};
				}
				
				throw new Error(`Unexpected fetch call: ${url}`);
			};

			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption
			await postQuantumEncryption.initialize();

			// Test auto-sync
			const result = await keySyncService.autoSyncOnLogin();
			
			expect(result.success).to.be.true;
			expect(syncCalled).to.be.false; // Should not have called sync
		});
	});

	describe('rate limiting', () => {
		it('should respect rate limiting', async () => {
			// Set up user in localStorage
			localStorage.setItem('qrypt_user', JSON.stringify({
				id: 'test-user-123',
				username: 'testuser'
			}));

			// Initialize encryption
			await postQuantumEncryption.initialize();

			// Mock successful sync
			mockFetch = global.fetch = async () => ({
				ok: true,
				json: async () => ({
					success: true,
					message: 'Public key synced successfully'
				})
			});

			// First sync should work
			const result1 = await keySyncService.syncPublicKey();
			expect(result1.success).to.be.true;

			// Second sync immediately should be rate limited
			const result2 = await keySyncService.syncPublicKey();
			expect(result2.success).to.be.false;
			expect(result2.error).to.equal('Rate limited');

			// Force sync should work
			const result3 = await keySyncService.forceSyncPublicKey();
			expect(result3.success).to.be.true;
		});
	});
});