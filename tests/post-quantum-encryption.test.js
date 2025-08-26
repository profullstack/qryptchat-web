/**
 * Test post-quantum encryption functionality
 * Using Mocha test framework
 */

import { expect } from 'chai';
import { PostQuantumEncryptionService } from '../src/lib/crypto/post-quantum-encryption.js';

describe('Post-Quantum Encryption', () => {
	let alice, bob;

	beforeEach(async () => {
		// Create two separate encryption services (Alice and Bob)
		alice = new PostQuantumEncryptionService();
		bob = new PostQuantumEncryptionService();
		
		await alice.initialize();
		await bob.initialize();
	});

	it('should generate ML-KEM-768 key pairs', async () => {
		const aliceKeys = await alice.getUserKeys();
		const bobKeys = await bob.getUserKeys();

		expect(aliceKeys).to.have.property('publicKey');
		expect(aliceKeys).to.have.property('privateKey');
		expect(bobKeys).to.have.property('publicKey');
		expect(bobKeys).to.have.property('privateKey');

		// Keys should be different
		expect(aliceKeys.publicKey).to.not.equal(bobKeys.publicKey);
		expect(aliceKeys.privateKey).to.not.equal(bobKeys.privateKey);

		console.log('✅ Generated ML-KEM-768 key pairs for Alice and Bob');
	});

	it('should encrypt and decrypt messages using post-quantum cryptography', async () => {
		const message = 'Hello from Alice to Bob using post-quantum encryption!';
		
		// Get Bob's public key
		const bobPublicKey = await bob.getPublicKey();
		
		// Alice encrypts message for Bob
		const encryptedMessage = await alice.encryptForRecipient(message, bobPublicKey);
		
		// Verify encrypted message is JSON with correct structure
		const messageData = JSON.parse(encryptedMessage);
		expect(messageData).to.have.property('v', 3); // Version 3 for post-quantum
		expect(messageData).to.have.property('alg', 'ML-KEM-768');
		expect(messageData).to.have.property('kem'); // KEM ciphertext
		expect(messageData).to.have.property('n'); // Nonce
		expect(messageData).to.have.property('c'); // Message ciphertext
		expect(messageData).to.have.property('t'); // Timestamp
		
		// Bob decrypts message from Alice
		const decryptedMessage = await bob.decryptFromSender(encryptedMessage, await alice.getPublicKey());
		
		expect(decryptedMessage).to.equal(message);
		console.log('✅ Successfully encrypted and decrypted message using ML-KEM-768');
		console.log(`   Original: "${message}"`);
		console.log(`   Decrypted: "${decryptedMessage}"`);
	});

	it('should handle multiple messages correctly', async () => {
		const messages = [
			'First post-quantum message',
			'Second message with 🔐 emojis',
			'Third message with special chars: àáâãäåæçèéêë'
		];
		
		const bobPublicKey = await bob.getPublicKey();
		
		for (const message of messages) {
			const encrypted = await alice.encryptForRecipient(message, bobPublicKey);
			const decrypted = await bob.decryptFromSender(encrypted, await alice.getPublicKey());
			
			expect(decrypted).to.equal(message);
		}
		
		console.log('✅ Successfully handled multiple messages with post-quantum encryption');
	});

	it('should fail gracefully with invalid keys', async () => {
		const message = 'Test message';
		const invalidPublicKey = 'invalid-key';
		
		try {
			await alice.encryptForRecipient(message, invalidPublicKey);
			expect.fail('Should have thrown an error for invalid public key');
		} catch (error) {
			expect(error.message).to.include('Invalid character');
		}
		
		console.log('✅ Properly handles invalid keys');
	});

	it('should provide correct algorithm information', () => {
		const info = alice.getAlgorithmInfo();
		
		expect(info).to.have.property('name', 'ML-KEM-768');
		expect(info).to.have.property('type', 'Post-Quantum KEM + Symmetric Encryption');
		expect(info).to.have.property('keyExchange', 'ML-KEM-768');
		expect(info).to.have.property('encryption', 'ChaCha20-Poly1305');
		expect(info).to.have.property('quantumResistant', true);
		expect(info).to.have.property('securityLevel', 3); // NIST Level 3
		
		console.log('✅ Algorithm information is correct:', info);
	});
});