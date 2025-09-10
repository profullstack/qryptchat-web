/**
 * Test to analyze and debug the encryption/decryption flow issues
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

describe('Encryption Flow Analysis', () => {
	beforeEach(async () => {
		await postQuantumEncryption.initialize();
	});

	it('should identify the JSON parsing issue in decryption', async () => {
		const testMessage = 'Hello, test message!';
		
		// Step 1: Encrypt message (this should work)
		const userKeys = await postQuantumEncryption.getUserKeys();
		const encryptedJson = await postQuantumEncryption.encryptForRecipient(testMessage, userKeys.publicKey);
		
		console.log('🔐 Encrypted JSON type:', typeof encryptedJson);
		console.log('🔐 Encrypted JSON preview:', encryptedJson.substring(0, 100));
		
		// Verify it's valid JSON
		const parsedEncrypted = JSON.parse(encryptedJson);
		expect(parsedEncrypted).to.have.property('v', 3);
		expect(parsedEncrypted).to.have.property('alg', 'ML-KEM-768');
		
		// Step 2: Simulate server storage conversion (JSON → Base64)
		const base64Content = Buffer.from(encryptedJson, 'utf8').toString('base64');
		console.log('🔐 Base64 content length:', base64Content.length);
		
		// Step 3: Simulate server loading conversion (Base64 → JSON string)
		const decodedJsonString = Buffer.from(base64Content, 'base64').toString('utf8');
		console.log('🔐 Decoded JSON string type:', typeof decodedJsonString);
		console.log('🔐 Decoded equals original:', decodedJsonString === encryptedJson);
		
		// Step 4: Try to decrypt the JSON string (this should work if properly handled)
		try {
			const decryptedMessage = await postQuantumEncryption.decryptFromSender(decodedJsonString, '');
			console.log('🔐 Decrypted message:', decryptedMessage);
			expect(decryptedMessage).to.equal(testMessage);
		} catch (error) {
			console.error('🔐 Decryption failed:', error instanceof Error ? error.message : String(error));
			throw error;
		}
	});

	it('should test direct JSON object vs JSON string decryption', async () => {
		const testMessage = 'Direct JSON test';
		const userKeys = await postQuantumEncryption.getUserKeys();
		
		// Encrypt to get JSON string
		const encryptedJsonString = await postQuantumEncryption.encryptForRecipient(testMessage, userKeys.publicKey);
		
		// Test 1: Decrypt JSON string directly (current flow)
		console.log('🔐 Testing JSON string decryption...');
		const result1 = await postQuantumEncryption.decryptFromSender(encryptedJsonString, '');
		console.log('🔐 Result 1:', result1);
		
		// Test 2: Parse JSON and then try to decrypt (what might be happening)
		console.log('🔐 Testing parsed JSON object decryption...');
		const parsedJson = JSON.parse(encryptedJsonString);
		try {
			const result2 = await postQuantumEncryption.decryptFromSender(JSON.stringify(parsedJson), '');
			console.log('🔐 Result 2:', result2);
		} catch (error) {
			console.log('🔐 Parsed JSON decryption failed:', error instanceof Error ? error.message : String(error));
		}
	});

	it('should verify the exact data flow from server message handling', async () => {
		const testMessage = 'Server flow simulation';
		const userKeys = await postQuantumEncryption.getUserKeys();
		
		// Step 1: Client encrypts message
		const clientEncrypted = await postQuantumEncryption.encryptForRecipient(testMessage, userKeys.publicKey);
		console.log('🔐 [CLIENT] Encrypted:', typeof clientEncrypted, clientEncrypted.length);
		
		// Step 2: Server converts for database storage (from messages.js:127)
		const serverBase64 = Buffer.from(clientEncrypted, 'utf8').toString('base64');
		console.log('🔐 [SERVER] Stored as base64:', serverBase64.length);
		
		// Step 3: Server loads from database and converts back (from messages.js:449)
		const serverDecoded = Buffer.from(serverBase64, 'base64').toString('utf8');
		console.log('🔐 [SERVER] Decoded for client:', typeof serverDecoded, serverDecoded.length);
		console.log('🔐 [SERVER] Matches original:', serverDecoded === clientEncrypted);
		
		// Step 4: Client receives and tries to decrypt
		console.log('🔐 [CLIENT] Attempting decryption...');
		const clientDecrypted = await postQuantumEncryption.decryptFromSender(serverDecoded, '');
		console.log('🔐 [CLIENT] Decrypted result:', clientDecrypted);
		
		expect(clientDecrypted).to.equal(testMessage);
	});
});