/**
 * Test to verify consistent use of ML-KEM-1024 for all new message encryption
 * This confirms that our backward compatibility fixes work properly
 */

import { describe, it, before } from 'mocha';
import { expect } from 'chai';
import { PostQuantumEncryptionService } from '../src/lib/crypto/post-quantum-encryption.js';
import { publicKeyService } from '../src/lib/crypto/public-key-service.js';
import { Base64 } from '../src/lib/crypto/index.js';

describe('ML-KEM-1024 Consistent Usage', () => {
  /** @type {PostQuantumEncryptionService} */
  let alice;
  /** @type {PostQuantumEncryptionService} */
  let bob;
  
  // ML-KEM key size constants
  const ML_KEM_768_PUBLIC_KEY_SIZE = 1184; // bytes
  const ML_KEM_1024_PUBLIC_KEY_SIZE = 1568; // bytes

  before(async () => {
    // Create two separate encryption services (Alice and Bob)
    alice = new PostQuantumEncryptionService();
    bob = new PostQuantumEncryptionService();
    
    await alice.initialize();
    await bob.initialize();
    
    // Initialize public key service
    await publicKeyService.initialize();
  });

  it('should generate ML-KEM-1024 key pairs by default', async () => {
    const aliceKeys = await alice.getUserKeys();
    const bobKeys = await bob.getUserKeys();

    // Check key format
    const alicePubKeyBytes = Base64.decode(aliceKeys.publicKey);
    const bobPubKeyBytes = Base64.decode(bobKeys.publicKey);
    
    console.log(`Alice public key length: ${alicePubKeyBytes.length} bytes`);
    console.log(`Bob public key length: ${bobPubKeyBytes.length} bytes`);
    
    expect(alicePubKeyBytes.length).to.equal(ML_KEM_1024_PUBLIC_KEY_SIZE);
    expect(bobPubKeyBytes.length).to.equal(ML_KEM_1024_PUBLIC_KEY_SIZE);
  });

  it('should encrypt messages using ML-KEM-1024 even with ML-KEM-768 recipient keys', async () => {
    const message = 'Test message for algorithm consistency';
    
    // Generate a simulated ML-KEM-768 key pair for Charlie (using bob's service)
    const charlieKeys = await bob.generateUserKeys768();
    console.log('Generated ML-KEM-768 keys for Charlie (simulation)');
    
    // Alice encrypts message for Charlie who has ML-KEM-768 keys
    const encryptedMessage = await alice.encryptForRecipient(message, charlieKeys.publicKey);
    console.log('Alice encrypted message for Charlie');
    
    // Verify the encrypted message uses ML-KEM-1024
    const parsed = JSON.parse(encryptedMessage);
    expect(parsed.v).to.equal(3);
    expect(parsed.alg).to.equal('ML-KEM-1024');
    
    console.log(`Encryption algorithm used: ${parsed.alg}`);
  });

  it('should use ML-KEM-1024 format in all new encryptions', async () => {
    const testMessages = [
      'First test message',
      'Second message with special chars: àáâãäåæçèéêë',
      'Third message with emojis: 🔐🔑🛡️'
    ];
    
    for (const message of testMessages) {
      // Get Bob's public key
      const bobPublicKey = await bob.getPublicKey();
      
      // Alice encrypts message for Bob
      const encryptedJson = await alice.encryptForRecipient(message, bobPublicKey);
      const parsed = JSON.parse(encryptedJson);
      
      // Verify ML-KEM-1024 was used
      expect(parsed.alg).to.equal('ML-KEM-1024');
      
      // Bob should be able to decrypt it
      const decrypted = await bob.decryptFromSender(encryptedJson, await alice.getPublicKey());
      expect(decrypted).to.equal(message);
    }
    
    console.log('✅ All messages were encrypted with ML-KEM-1024 and successfully decrypted');
  });

  it('should detect public key formats correctly', async () => {
    // Generate both key types for testing
    const keys1024 = await alice.getUserKeys();
    const keys768 = await alice.getUserKeys768();
    
    // Detect formats using the public key service
    const format1024 = publicKeyService.detectKeyFormat(keys1024.publicKey);
    const format768 = publicKeyService.detectKeyFormat(keys768.publicKey);
    
    console.log(`Detected format for 1024-bit key: ${format1024}`);
    console.log(`Detected format for 768-bit key: ${format768}`);
    
    expect(format1024).to.equal('ML-KEM-1024');
    expect(format768).to.equal('ML-KEM-768');
  });

  it('should handle invalid encapsulation key errors by using ML-KEM-1024', async () => {
    const message = 'Test message for invalid key handling';
    
    // Get Charlie's ML-KEM-768 public key
    const charlieKeys = await bob.getUserKeys768();
    
    try {
      // Alice encrypts message for Charlie who has ML-KEM-768 keys
      // This should now work with our fix by using ML-KEM-1024
      const encryptedMessage = await alice.encryptForRecipient(message, charlieKeys.publicKey);
      
      // Verify that ML-KEM-1024 was used
      const parsed = JSON.parse(encryptedMessage);
      expect(parsed.alg).to.equal('ML-KEM-1024');
      
      console.log('✅ Successfully encrypted using ML-KEM-1024 for ML-KEM-768 recipient');
    } catch (error) {
      console.error('❌ Failed with error:', error instanceof Error ? error.message : String(error));
      expect.fail('Should not throw invalid encapsulation key error');
    }
  });
});