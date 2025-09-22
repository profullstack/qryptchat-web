/**
 * Test suite to demonstrate the critical password bypass vulnerability
 * in the private key import/export system
 */

import { expect } from 'chai';
import { privateKeyManager } from '../src/lib/crypto/private-key-manager.js';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';
import { keyManager } from '../src/lib/crypto/key-manager.js';

describe('Private Key Password Security Vulnerability', () => {
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

	describe('Password Bypass Vulnerability', () => {
		it('should demonstrate that wrong passwords are accepted during import', async () => {
			const correctPassword = 'mySecurePassword123';
			const wrongPassword = 'completelyWrongPassword';
			
			// Export keys with correct password
			const exportedData = await privateKeyManager.exportPrivateKeys(correctPassword);
			expect(exportedData).to.be.a('string');
			
			// Clear current keys to simulate importing on different device
			await postQuantumEncryption.clearUserKeys();
			
			// Attempt to import with WRONG password - this should fail but doesn't!
			let importSucceeded = false;
			try {
				await privateKeyManager.importPrivateKeys(exportedData, wrongPassword);
				importSucceeded = true;
			} catch (error) {
				// Import should have failed but probably won't due to the bug
				console.log('Import correctly failed with wrong password:', error.message);
			}
			
			// This assertion will fail, demonstrating the vulnerability
			expect(importSucceeded).to.be.false; // This should pass but will fail due to the bug
		});

		it('should demonstrate that any password works for import', async () => {
			const exportPassword = 'originalPassword123';
			const testPasswords = [
				'wrongPassword',
				'',
				'a',
				'completely-different-password',
				'12345'
			];
			
			// Export keys with a specific password
			const exportedData = await privateKeyManager.exportPrivateKeys(exportPassword);
			
			// Test that ALL passwords work (they shouldn't!)
			for (const testPassword of testPasswords) {
				// Clear keys before each test
				await postQuantumEncryption.clearUserKeys();
				
				let importFailed = false;
				try {
					await privateKeyManager.importPrivateKeys(exportedData, testPassword);
				} catch (error) {
					importFailed = true;
					console.log(`Import correctly failed with password "${testPassword}":`, error.message);
				}
				
				// Each import should fail, but they probably won't
				if (!importFailed) {
					console.log(`❌ VULNERABILITY: Import succeeded with wrong password: "${testPassword}"`);
				}
				
				// This assertion should pass (import should fail) but will likely fail due to the bug
				expect(importFailed).to.be.true;
			}
		});

		it('should demonstrate that the password derivation is never used', async () => {
			const password = 'testPassword123';
			
			// Export keys
			const exportedData = await privateKeyManager.exportPrivateKeys(password);
			const parsedExport = JSON.parse(exportedData);
			
			// The export should contain tempPrivateKey, proving password isn't used for encryption
			expect(parsedExport).to.have.property('tempPrivateKey');
			expect(parsedExport).to.have.property('salt'); // Salt is generated but not used properly
			
			// Clear keys and import with different password
			await postQuantumEncryption.clearUserKeys();
			
			// This should fail but won't because tempPrivateKey is used instead of password
			await privateKeyManager.importPrivateKeys(exportedData, 'differentPassword');
			
			// If we reach here, the password was bypassed
			console.log('❌ CRITICAL: Password completely bypassed in key import/export');
		});
	});

	describe('Expected Behavior (Currently Broken)', () => {
		it('should reject import with wrong password', async () => {
			const correctPassword = 'securePassword123';
			const wrongPassword = 'wrongPassword456';
			
			// Export with correct password
			const exportedData = await privateKeyManager.exportPrivateKeys(correctPassword);
			
			// Clear keys
			await postQuantumEncryption.clearUserKeys();
			
			// Import with wrong password should fail
			try {
				await privateKeyManager.importPrivateKeys(exportedData, wrongPassword);
				throw new Error('Import should have failed but succeeded');
			} catch (error) {
				expect(error.message).to.include('password');
			}
		});

		it('should only accept correct password for import', async () => {
			const password = 'myPassword123';
			
			// Export with specific password
			const exportedData = await privateKeyManager.exportPrivateKeys(password);
			
			// Clear keys
			await postQuantumEncryption.clearUserKeys();
			
			// Should succeed with correct password
			await privateKeyManager.importPrivateKeys(exportedData, password);
			
			// Verify keys were imported
			const hasKeys = await keyManager.hasUserKeys();
			expect(hasKeys).to.be.true;
		});
	});
});