/**
 * Comprehensive test to verify the encryption/decryption fix
 * This test simulates the complete data flow from client to database and back
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

describe('Encryption Fix Verification', () => {
	let userKeys1, userKeys2;

	before(async () => {
		// Initialize encryption service
		await postQuantumEncryption.initialize();
		
		// Generate two sets of keys to simulate two users
		userKeys1 = await postQuantumEncryption.generateUserKeys();
		userKeys2 = await postQuantumEncryption.generateUserKeys();
		
		console.log('🔐 [FIX-TEST] Generated test keys for verification');
	});

	it('should handle the complete fixed data flow correctly', async () => {
		const originalMessage = 'This is a test message to verify the encryption fix works correctly!';
		
		console.log('🔐 [FIX-TEST] ==================== TESTING FIXED DATA FLOW ====================');
		
		// Step 1: Client encrypts message (post-quantum encryption)
		const encryptedJson = await postQuantumEncryption.encryptForRecipient(
			originalMessage, 
			userKeys2.publicKey
		);
		
		console.log('🔐 [FIX-TEST] Step 1 - Client encrypted to JSON:', {
			type: typeof encryptedJson,
			length: encryptedJson.length,
			isValidJSON: (() => {
				try {
					const parsed = JSON.parse(encryptedJson);
					return parsed.v === 3 && parsed.alg === 'ML-KEM-768';
				} catch {
					return false;
				}
			})(),
			preview: encryptedJson.substring(0, 100)
		});
		
		// Step 2: Server converts JSON to Base64 for database storage
		const base64ForStorage = Buffer.from(encryptedJson, 'utf8').toString('base64');
		
		console.log('🔐 [FIX-TEST] Step 2 - Server converts to Base64:', {
			base64Length: base64ForStorage.length,
			isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64ForStorage),
			preview: base64ForStorage.substring(0, 100)
		});
		
		// Step 3: Database stores Base64 as TEXT (simulated - the migration handles this)
		// The new database function stores the Base64 directly as TEXT instead of converting to BYTEA
		const storedInDatabase = base64ForStorage; // Now stored as TEXT, not BYTEA
		
		console.log('🔐 [FIX-TEST] Step 3 - Database stores as TEXT:', {
			storedType: typeof storedInDatabase,
			storedLength: storedInDatabase.length,
			matchesBase64: storedInDatabase === base64ForStorage
		});
		
		// Step 4: Server retrieves from database and converts Base64 back to JSON
		const retrievedFromDatabase = storedInDatabase; // Retrieved as TEXT (not corrupted BYTEA)
		const decodedBackToJson = Buffer.from(retrievedFromDatabase, 'base64').toString('utf8');
		
		console.log('🔐 [FIX-TEST] Step 4 - Server converts back to JSON:', {
			retrievedLength: retrievedFromDatabase.length,
			decodedLength: decodedBackToJson.length,
			isValidJSON: (() => {
				try {
					JSON.parse(decodedBackToJson);
					return true;
				} catch {
					return false;
				}
			})(),
			matchesOriginalJson: decodedBackToJson === encryptedJson,
			preview: decodedBackToJson.substring(0, 100)
		});
		
		// Step 5: Client decrypts the JSON content
		const decryptedMessage = await postQuantumEncryption.decryptFromSender(
			decodedBackToJson,
			userKeys1.publicKey
		);
		
		console.log('🔐 [FIX-TEST] Step 5 - Client decryption result:', {
			decryptedMessage,
			matchesOriginal: decryptedMessage === originalMessage,
			success: decryptedMessage !== '[Encrypted message - decryption failed]'
		});
		
		// Verify the complete flow worked
		expect(decryptedMessage).to.equal(originalMessage);
		expect(decryptedMessage).to.not.equal('[Encrypted message - decryption failed]');
		
		console.log('🔐 [FIX-TEST] ✅ COMPLETE DATA FLOW VERIFICATION SUCCESSFUL!');
	});

	it('should handle the old corrupted data gracefully', async () => {
		// Simulate what would happen with old corrupted BYTEA data
		const corruptedData = 'Ƕ�۾��v��g6ۭzs���v�ۇxsgxo�xwgw�~��m�sm�o�zwm�km��';
		
		console.log('🔐 [FIX-TEST] Testing graceful handling of corrupted data...');
		
		const result = await postQuantumEncryption.decryptFromSender(
			corruptedData,
			userKeys1.publicKey
		);
		
		console.log('🔐 [FIX-TEST] Corrupted data result:', result);
		
		// Should return the fallback message, not crash
		expect(result).to.equal('[Encrypted message - decryption failed]');
		
		console.log('🔐 [FIX-TEST] ✅ CORRUPTED DATA HANDLED GRACEFULLY!');
	});

	it('should verify the data format consistency', async () => {
		const testMessage = 'Format consistency test message';
		
		// Encrypt message
		const encrypted = await postQuantumEncryption.encryptForRecipient(
			testMessage, 
			userKeys2.publicKey
		);
		
		// Parse the JSON to verify structure
		const parsedEncrypted = JSON.parse(encrypted);
		
		console.log('🔐 [FIX-TEST] Verifying encrypted message format:', {
			version: parsedEncrypted.v,
			algorithm: parsedEncrypted.alg,
			hasKem: !!parsedEncrypted.kem,
			hasNonce: !!parsedEncrypted.n,
			hasCiphertext: !!parsedEncrypted.c,
			hasTimestamp: !!parsedEncrypted.t
		});
		
		// Verify all required fields are present
		expect(parsedEncrypted.v).to.equal(3);
		expect(parsedEncrypted.alg).to.equal('ML-KEM-768');
		expect(parsedEncrypted.kem).to.be.a('string');
		expect(parsedEncrypted.n).to.be.a('string');
		expect(parsedEncrypted.c).to.be.a('string');
		expect(parsedEncrypted.t).to.be.a('number');
		
		// Verify Base64 encoding of components
		expect(/^[A-Za-z0-9+/]*={0,2}$/.test(parsedEncrypted.kem)).to.be.true;
		expect(/^[A-Za-z0-9+/]*={0,2}$/.test(parsedEncrypted.n)).to.be.true;
		expect(/^[A-Za-z0-9+/]*={0,2}$/.test(parsedEncrypted.c)).to.be.true;
		
		console.log('🔐 [FIX-TEST] ✅ DATA FORMAT CONSISTENCY VERIFIED!');
	});
});