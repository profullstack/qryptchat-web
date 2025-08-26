/**
 * Browser debugging utilities for encryption
 */

import { clientEncryption } from '../crypto/client-encryption.js';

/**
 * Debug encryption in the browser console
 */
export async function debugEncryption() {
	console.log('🔐 === ENCRYPTION DEBUG START ===');
	
	try {
		// Initialize encryption service
		console.log('🔐 Initializing encryption service...');
		await clientEncryption.initialize();
		console.log('🔐 ✅ Encryption service initialized');
		
		// Test basic encryption/decryption
		const testConversationId = 'debug-conversation-' + Date.now();
		const testMessage = 'Debug test message: ' + new Date().toISOString();
		
		console.log('🔐 Testing encryption with:', {
			conversationId: testConversationId,
			message: testMessage
		});
		
		// Encrypt
		const encrypted = await clientEncryption.encryptMessage(testConversationId, testMessage);
		console.log('🔐 Encrypted result:', encrypted);
		
		// Decrypt
		const decrypted = await clientEncryption.decryptMessage(testConversationId, encrypted);
		console.log('🔐 Decrypted result:', decrypted);
		
		// Verify
		const success = decrypted === testMessage;
		console.log('🔐 Test result:', success ? '✅ SUCCESS' : '❌ FAILED');
		
		if (!success) {
			console.error('🔐 ❌ Encryption test failed!', {
				original: testMessage,
				decrypted: decrypted,
				match: decrypted === testMessage
			});
		}
		
		return success;
		
	} catch (error) {
		console.error('🔐 ❌ Encryption debug failed:', error);
		return false;
	} finally {
		console.log('🔐 === ENCRYPTION DEBUG END ===');
	}
}

/**
 * Clear all encryption keys and restart
 */
export async function clearAllEncryptionKeys() {
	console.log('🔐 === CLEARING ALL ENCRYPTION KEYS ===');
	
	try {
		// Clear from encryption service
		await clientEncryption.clearAllKeys();
		console.log('🔐 ✅ Cleared keys from encryption service');
		
		// Clear from localStorage manually (in case there are old keys)
		const keysToRemove = [
			'qryptchat_conversation_keys',
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
		await clientEncryption.initialize();
		console.log('🔐 ✅ Re-initialized encryption service');
		
		console.log('🔐 === KEYS CLEARED SUCCESSFULLY ===');
		return true;
		
	} catch (error) {
		console.error('🔐 ❌ Failed to clear encryption keys:', error);
		return false;
	}
}

/**
 * Show current encryption status
 */
export function showEncryptionStatus() {
	console.log('🔐 === ENCRYPTION STATUS ===');
	
	// Check localStorage
	const storageKeys = [
		'qryptchat_conversation_keys',
		'qryptchat_keys',
		'qrypt_encryption_keys'
	];
	
	console.log('🔐 LocalStorage keys:');
	for (const key of storageKeys) {
		const value = localStorage.getItem(key);
		if (value) {
			try {
				const parsed = JSON.parse(value);
				console.log(`  ${key}:`, Object.keys(parsed).length, 'conversations');
			} catch {
				console.log(`  ${key}:`, 'invalid JSON');
			}
		} else {
			console.log(`  ${key}:`, 'not found');
		}
	}
	
	// Check service state
	console.log('🔐 Service state:');
	console.log('  isInitialized:', clientEncryption.isInitialized);
	console.log('  conversationKeys size:', clientEncryption.conversationKeys?.size || 0);
}

// Make functions available globally for browser console debugging
if (typeof window !== 'undefined') {
	window.debugEncryption = debugEncryption;
	window.clearAllEncryptionKeys = clearAllEncryptionKeys;
	window.showEncryptionStatus = showEncryptionStatus;
	
	console.log('🔐 Encryption debug functions available:');
	console.log('  - debugEncryption()');
	console.log('  - clearAllEncryptionKeys()');
	console.log('  - showEncryptionStatus()');
}