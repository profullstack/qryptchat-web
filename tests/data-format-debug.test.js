/**
 * Test to debug the data format conversion issue between server and client
 * This reproduces the exact problem seen in production logs
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

describe('Data Format Conversion Debug', () => {
	let userKeys1, userKeys2;

	before(async () => {
		// Initialize encryption service
		await postQuantumEncryption.initialize();
		
		// Generate two sets of keys to simulate two users
		userKeys1 = await postQuantumEncryption.generateUserKeys();
		userKeys2 = await postQuantumEncryption.generateUserKeys();
		
		console.log('🔐 [TEST] Generated test keys');
	});

	it('should reproduce the server data conversion issue', async () => {
		const originalMessage = 'Test message for debugging';
		
		// Step 1: Client encrypts message (what happens in multi-recipient-encryption.js)
		const encryptedJson = await postQuantumEncryption.encryptForRecipient(
			originalMessage, 
			userKeys2.publicKey
		);
		
		console.log('🔐 [TEST] Step 1 - Client encrypted JSON:', {
			type: typeof encryptedJson,
			length: encryptedJson.length,
			preview: encryptedJson.substring(0, 100),
			isValidJSON: (() => {
				try {
					JSON.parse(encryptedJson);
					return true;
				} catch {
					return false;
				}
			})()
		});
		
		// Step 2: Server converts JSON to Base64 for storage (lines 126-136 in messages.js)
		const base64ForStorage = Buffer.from(encryptedJson, 'utf8').toString('base64');
		
		console.log('🔐 [TEST] Step 2 - Server converts to Base64:', {
			base64Length: base64ForStorage.length,
			base64Preview: base64ForStorage.substring(0, 100),
			isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64ForStorage)
		});
		
		// Step 3: Server retrieves from database and converts back (lines 447-469 in messages.js)
		const decodedFromBase64 = Buffer.from(base64ForStorage, 'base64').toString('utf8');
		
		console.log('🔐 [TEST] Step 3 - Server converts back from Base64:', {
			decodedLength: decodedFromBase64.length,
			decodedPreview: decodedFromBase64.substring(0, 100),
			isValidJSON: (() => {
				try {
					JSON.parse(decodedFromBase64);
					return true;
				} catch {
					return false;
				}
			})(),
			matchesOriginal: decodedFromBase64 === encryptedJson
		});
		
		// Step 4: Client tries to decrypt (what's failing in production)
		try {
			const decryptedMessage = await postQuantumEncryption.decryptFromSender(
				decodedFromBase64,
				userKeys1.publicKey
			);
			
			console.log('🔐 [TEST] Step 4 - Client decryption result:', decryptedMessage);
			expect(decryptedMessage).to.equal(originalMessage);
			
		} catch (error) {
			console.error('🔐 [TEST] Step 4 - Client decryption FAILED:', error.message);
			
			// Let's also test what happens if we pass the raw base64 (simulating the bug)
			console.log('🔐 [TEST] Testing with raw base64 (simulating bug)...');
			try {
				const buggyResult = await postQuantumEncryption.decryptFromSender(
					base64ForStorage,
					userKeys1.publicKey
				);
				console.log('🔐 [TEST] Buggy decryption result:', buggyResult);
			} catch (buggyError) {
				console.error('🔐 [TEST] Buggy decryption also failed:', buggyError.message);
			}
			
			throw error;
		}
	});

	it('should test what happens with corrupted data', async () => {
		// Simulate what we see in the production logs - binary/corrupted data
		const corruptedData = 'Ƕ�۾��v��g6ۭzs���v�ۇxsgxo�xwgw�~��m�sm�o�zwm�km��';
		
		console.log('🔐 [TEST] Testing with corrupted data:', {
			type: typeof corruptedData,
			length: corruptedData.length,
			preview: corruptedData.substring(0, 50)
		});
		
		try {
			const result = await postQuantumEncryption.decryptFromSender(
				corruptedData,
				userKeys1.publicKey
			);
			console.log('🔐 [TEST] Corrupted data result:', result);
		} catch (error) {
			console.log('🔐 [TEST] Corrupted data failed as expected:', error.message);
			expect(error.message).to.include('Invalid encrypted content format');
		}
	});
});