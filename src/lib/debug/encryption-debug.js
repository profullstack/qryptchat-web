/**
 * Browser debugging utilities for post-quantum encryption
 */

import { postQuantumEncryption } from '../crypto/post-quantum-encryption.js';

/**
 * Debug post-quantum encryption in the browser console
 */
export async function debugEncryption() {
	console.log('🔐 === POST-QUANTUM ENCRYPTION DEBUG START ===');
	
	try {
		// Initialize encryption service
		console.log('🔐 Initializing post-quantum encryption service...');
		await postQuantumEncryption.initialize();
		console.log('🔐 ✅ Post-quantum encryption service initialized');
		
		// Generate test keys
		const testKeys = await postQuantumEncryption.getUserKeys();
		console.log('🔐 Test keys generated:', {
			publicKeyLength: testKeys.publicKey.length,
			privateKeyLength: testKeys.privateKey.length
		});
		
		// Test basic encryption/decryption
		const testMessage = 'Debug test message: ' + new Date().toISOString();
		
		console.log('🔐 Testing post-quantum encryption with:', {
			message: testMessage,
			algorithm: 'ML-KEM-768'
		});
		
		// Encrypt for self (using own public key)
		const encrypted = await postQuantumEncryption.encryptForRecipient(testMessage, testKeys.publicKey);
		console.log('🔐 Encrypted result:', encrypted);
		
		// Decrypt
		const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, testKeys.publicKey);
		console.log('🔐 Decrypted result:', decrypted);
		
		// Verify
		const success = decrypted === testMessage;
		console.log('🔐 Test result:', success ? '✅ SUCCESS' : '❌ FAILED');
		
		if (!success) {
			console.error('🔐 ❌ Post-quantum encryption test failed!', {
				original: testMessage,
				decrypted: decrypted,
				match: decrypted === testMessage
			});
		}
		
		return success;
		
	} catch (error) {
		console.error('🔐 ❌ Post-quantum encryption debug failed:', error);
		return false;
	} finally {
		console.log('🔐 === POST-QUANTUM ENCRYPTION DEBUG END ===');
	}
}

/**
 * Clear all post-quantum encryption keys and restart
 */
export async function clearAllEncryptionKeys() {
	console.log('🔐 === CLEARING ALL POST-QUANTUM ENCRYPTION KEYS ===');
	
	try {
		// Clear from post-quantum encryption service
		await postQuantumEncryption.clearUserKeys();
		console.log('🔐 ✅ Cleared keys from post-quantum encryption service');
		
		// Clear from localStorage manually (in case there are old keys)
		const keysToRemove = [
			'qryptchat_pq_keypair', // post-quantum keys
			'qryptchat_conversation_keys', // old conversation keys
			'qryptchat_keys', // old key format
			'qrypt_encryption_keys', // another old format
		];
		
		for (const key of keysToRemove) {
			if (localStorage.getItem(key)) {
				localStorage.removeItem(key);
				console.log(`🔐 ✅ Removed localStorage key: ${key}`);
			}
		}
		
		// Re-initialize
		await postQuantumEncryption.initialize();
		console.log('🔐 ✅ Re-initialized post-quantum encryption service');
		
		console.log('🔐 === POST-QUANTUM KEYS CLEARED SUCCESSFULLY ===');
		return true;
		
	} catch (error) {
		console.error('🔐 ❌ Failed to clear post-quantum encryption keys:', error);
		return false;
	}
}

/**
 * Show current post-quantum encryption status
 */
export function showEncryptionStatus() {
	console.log('🔐 === POST-QUANTUM ENCRYPTION STATUS ===');
	
	// Check localStorage
	const storageKeys = [
		'qryptchat_pq_keypair', // post-quantum keys
		'qryptchat_conversation_keys', // old conversation keys
		'qryptchat_keys',
		'qrypt_encryption_keys'
	];
	
	console.log('🔐 LocalStorage keys:');
	for (const key of storageKeys) {
		const value = localStorage.getItem(key);
		if (value) {
			try {
				const parsed = JSON.parse(value);
				if (key === 'qryptchat_pq_keypair') {
					console.log(`  ${key}:`, {
						algorithm: parsed.algorithm || 'unknown',
						version: parsed.version || 'unknown',
						timestamp: parsed.timestamp ? new Date(parsed.timestamp).toISOString() : 'unknown'
					});
				} else {
					console.log(`  ${key}:`, Object.keys(parsed).length, 'entries');
				}
			} catch {
				console.log(`  ${key}:`, 'invalid JSON');
			}
		} else {
			console.log(`  ${key}:`, 'not found');
		}
	}
	
	// Check service state
	console.log('🔐 Post-quantum service state:');
	console.log('  isInitialized:', postQuantumEncryption.isInitialized);
	console.log('  algorithm:', postQuantumEncryption.kemName);
	console.log('  publicKeyCache size:', postQuantumEncryption.publicKeyCache?.size || 0);
	console.log('  hasUserKeys:', !!postQuantumEncryption.userKeys);
}

// Make functions available globally for browser console debugging
if (typeof window !== 'undefined') {
	window.debugEncryption = debugEncryption;
	window.clearAllEncryptionKeys = clearAllEncryptionKeys;
	window.showEncryptionStatus = showEncryptionStatus;
	
	console.log('🔐 Post-quantum encryption debug functions available:');
	console.log('  - debugEncryption() - Test ML-KEM-768 encryption');
	console.log('  - clearAllEncryptionKeys() - Clear all post-quantum keys');
	console.log('  - showEncryptionStatus() - Show current encryption status');
}