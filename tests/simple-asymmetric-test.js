/**
 * Simple test for asymmetric encryption without complex mocking
 */

// Mock browser environment
global.window = {};
global.localStorage = {
	data: {},
	getItem(key) { return this.data[key] || null; },
	setItem(key, value) { this.data[key] = value; },
	removeItem(key) { delete this.data[key]; },
	clear() { this.data = {}; }
};

// Node.js v22+ has built-in Web Crypto API, so we don't need to mock it
console.log('🔧 Using Node.js built-in Web Crypto API');

import { AsymmetricEncryptionService } from '../src/lib/crypto/asymmetric-encryption.js';

async function testAsymmetricEncryption() {
	console.log('🧪 Testing Asymmetric Encryption...');
	
	try {
		// Create two services (simulating two users)
		const alice = new AsymmetricEncryptionService();
		const bob = new AsymmetricEncryptionService();
		
		// Initialize both services
		await alice.initialize();
		await bob.initialize();
		
		// Get their public keys
		const alicePublicKey = await alice.getPublicKey();
		const bobPublicKey = await bob.getPublicKey();
		
		console.log('✅ Generated keys for Alice and Bob');
		console.log('Alice public key length:', alicePublicKey.length);
		console.log('Bob public key length:', bobPublicKey.length);
		
		// Test message encryption/decryption
		const message = 'Hello from Alice to Bob!';
		
		// Alice encrypts message for Bob
		console.log('🔐 Alice encrypting message for Bob...');
		const encrypted = await alice.encryptForRecipient(message, bobPublicKey);
		console.log('✅ Message encrypted, length:', encrypted.length);
		
		// Bob decrypts message from Alice
		console.log('🔓 Bob decrypting message from Alice...');
		const decrypted = await bob.decryptFromSender(encrypted, alicePublicKey);
		console.log('✅ Message decrypted:', decrypted);
		
		// Verify the message matches
		if (decrypted === message) {
			console.log('🎉 SUCCESS: Asymmetric encryption working correctly!');
			return true;
		} else {
			console.log('❌ FAILURE: Decrypted message does not match original');
			console.log('Original:', message);
			console.log('Decrypted:', decrypted);
			return false;
		}
		
	} catch (error) {
		console.error('❌ Test failed with error:', error);
		return false;
	}
}

// Run the test
testAsymmetricEncryption().then(success => {
	process.exit(success ? 0 : 1);
});