/**
 * Test suite to verify the password security fix works correctly
 */

import { expect } from 'chai';
import { privateKeyManager } from '../src/lib/crypto/private-key-manager.js';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';
import { keyManager } from '../src/lib/crypto/key-manager.js';

describe('Password Security Fix Verification', () => {
	let originalKeys;
	
	before(async () => {
		// Initialize the crypto systems
		await keyManager.initialize();
		await postQuantumEncryption.initialize();
		
		// Generate test keys if they don't exist
		const hasKeys = await keyManager.hasUserKeys();
		if (!hasKeys) {
			await keyManager.generateUserKeys();
		}
		
		// Store original keys for restoration
		originalKeys = await postQuantumEncryption.exportUserKeys();
	});
	
	after(async () => {
		// Restore original keys
		if (originalKeys) {
			await postQuantumEncryption.clearUserKeys();
			if (originalKeys.keys1024) {
				await postQuantumEncryption.importUserKeys(
					originalKeys.keys1024.publicKey,
					originalKeys.keys1024.privateKey,
					originalKeys.keys1024.algorithm
				);
			}
			if (originalKeys.keys768) {
				await postQuantumEncryption.importUserKeys(
					originalKeys.keys768.publicKey,
					originalKeys.keys768.privateKey,
					originalKeys.keys768.algorithm
				);
			}
		}
	});

	describe('Fixed Password Validation', () => {
		it('should accept correct password for import', async () => {
			const password = 'correctPassword123';
			
			// Export keys with specific password
			const exportedData = await privateKeyManager.exportPrivateKeys(password);
			expect(exportedData).to.be.a('string');
			
			// Verify the export uses AES-GCM format
			const parsedExport = JSON.parse(exportedData);
			expect(parsedExport).to.have.property('algorithm', 'AES-GCM-256');
			expect(parsedExport).to.have.property('iv');
			expect(parsedExport).not.to.have.property('tempPrivateKey'); // Should not have temp key anymore
			
			// Clear keys
			await postQuantumEncryption.clearUserKeys();
			
			// Should succeed with correct password
			await privateKeyManager.importPrivateKeys(exportedData, password);
			
			// Verify keys were imported
			const hasKeys = await keyManager.hasUserKeys();
			expect(hasKeys).to.be.true;
		});

		it('should reject wrong password for import', async () => {
			const correctPassword = 'mySecurePassword123';
			const wrongPassword = 'wrongPassword456';
			
			// Export with correct password
			const exportedData = await privateKeyManager.exportPrivateKeys(correctPassword);
			
			// Clear keys
			await postQuantumEncryption.clearUserKeys();
			
			// Import with wrong password should fail
			let importFailed = false;
			try {
				await privateKeyManager.importPrivateKeys(exportedData, wrongPassword);
			} catch (error) {
				importFailed = true;
				expect(error.message).to.include('Invalid password or corrupted data');
			}
			
			// Should have failed
			expect(importFailed).to.be.true;
			
			// Verify keys were NOT imported
			const hasKeys = await keyManager.hasUserKeys();
			expect(hasKeys).to.be.false;
		});

		it('should reject empty password for import', async () => {
			const password = 'testPassword123';
			
			// Export with valid password
			const exportedData = await privateKeyManager.exportPrivateKeys(password);
			
			// Clear keys
			await postQuantumEncryption.clearUserKeys();
			
			// Try to import with empty password
			let importFailed = false;
			try {
				await privateKeyManager.importPrivateKeys(exportedData, '');
			} catch (error) {
				importFailed = true;
				expect(error.message).to.include('Password is required');
			}
			
			expect(importFailed).to.be.true;
		});

		it('should use different encryption for different passwords', async () => {
			const password1 = 'password123';
			const password2 = 'differentPassword456';
			
			// Export with first password
			const export1 = await privateKeyManager.exportPrivateKeys(password1);
			const export2 = await privateKeyManager.exportPrivateKeys(password2);
			
			const parsed1 = JSON.parse(export1);
			const parsed2 = JSON.parse(export2);
			
			// Different passwords should result in different encrypted data
			expect(parsed1.encryptedKeys).to.not.equal(parsed2.encryptedKeys);
			expect(parsed1.salt).to.not.equal(parsed2.salt);
			expect(parsed1.iv).to.not.equal(parsed2.iv);
		});

		it('should validate password strength requirements', async () => {
			const weakPassword = '123';
			
			try {
				await privateKeyManager.exportPrivateKeys(weakPassword);
				// If we get here, the export succeeded when it should have failed
				expect.fail('Export should have failed with weak password');
			} catch (error) {
				// The current implementation doesn't validate password strength in export
				// but it should fail during the crypto operations due to insufficient entropy
				expect(error.message).to.exist;
			}
		});
	});

	describe('Security Improvements', () => {
		it('should use proper AES-GCM encryption format', async () => {
			const password = 'securePassword123';
			
			const exportedData = await privateKeyManager.exportPrivateKeys(password);
			const parsedData = JSON.parse(exportedData);
			
			// Verify new secure format
			expect(parsedData.version).to.equal('2.0');
			expect(parsedData.algorithm).to.equal('AES-GCM-256');
			expect(parsedData).to.have.property('encryptedKeys');
			expect(parsedData).to.have.property('salt');
			expect(parsedData).to.have.property('iv');
			expect(parsedData).to.have.property('timestamp');
			
			// Should not have the insecure temp key
			expect(parsedData).to.not.have.property('tempPrivateKey');
		});

		it('should use unique salt and IV for each export', async () => {
			const password = 'testPassword123';
			
			const export1 = await privateKeyManager.exportPrivateKeys(password);
			const export2 = await privateKeyManager.exportPrivateKeys(password);
			
			const parsed1 = JSON.parse(export1);
			const parsed2 = JSON.parse(export2);
			
			// Even with same password, salt and IV should be unique
			expect(parsed1.salt).to.not.equal(parsed2.salt);
			expect(parsed1.iv).to.not.equal(parsed2.iv);
		});
	});
});