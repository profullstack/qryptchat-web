/**
 * @fileoverview ML-KEM Integration Tests
 * Tests for post-quantum cryptography using ML-KEM-1024 and ML-KEM-768
 * Following FIPS 203 standard for quantum-resistant key encapsulation
 */

import { expect, describe, it, beforeEach } from 'vitest';

// Import ML-KEM functions
import { 
  MlKem512, 
  MlKem768, 
  MlKem1024 
} from 'mlkem';

describe('ML-KEM Post-Quantum Cryptography Integration', () => {
  describe('ML-KEM-1024 (Primary)', () => {
    let mlkem1024;
    let keyPair1024;
    let keyPair1024_2;

    beforeEach(async () => {
      // Create ML-KEM instances and generate fresh key pairs for each test
      mlkem1024 = new MlKem1024();
      keyPair1024 = await mlkem1024.generateKeyPair();
      keyPair1024_2 = await mlkem1024.generateKeyPair();
    });

    it('should generate ML-KEM-1024 key pairs with correct sizes', () => {
      expect(keyPair1024).to.be.an('array');
      expect(keyPair1024).to.have.lengthOf(2);
      
      // FIPS 203 ML-KEM-1024 key sizes
      const [publicKey, privateKey] = keyPair1024;
      expect(publicKey).to.have.lengthOf(1568); // bytes
      expect(privateKey).to.have.lengthOf(3168); // bytes
    });

    it('should perform encapsulation and decapsulation successfully', async () => {
      const [publicKey, privateKey] = keyPair1024;
      
      // Encapsulate using public key
      const encapResult = await mlkem1024.encap(publicKey);
      expect(encapResult).to.be.an('array');
      expect(encapResult).to.have.lengthOf(2);
      
      const [ciphertext, sharedSecret1] = encapResult;
      
      // Decapsulate using private key
      const sharedSecret2 = await mlkem1024.decap(ciphertext, privateKey);
      
      // Shared secrets should match
      expect(sharedSecret1).to.deep.equal(sharedSecret2);
      expect(sharedSecret1).to.have.lengthOf(32); // 256-bit shared secret
    });

    it('should generate different shared secrets for different key pairs', async () => {
      const [publicKey1] = keyPair1024;
      const [publicKey2] = keyPair1024_2;
      
      const [, sharedSecret1] = await mlkem1024.encap(publicKey1);
      const [, sharedSecret2] = await mlkem1024.encap(publicKey2);
      
      expect(sharedSecret1).to.not.deep.equal(sharedSecret2);
    });

    it('should fail decapsulation with wrong private key', async () => {
      const [publicKey] = keyPair1024;
      const [, privateKey2] = keyPair1024_2;
      
      const [ciphertext] = await mlkem1024.encap(publicKey);
      
      try {
        await mlkem1024.decap(ciphertext, privateKey2);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
      }
    });
  });

  describe('ML-KEM-768 (Backward Compatibility)', () => {
    let mlkem768;
    let keyPair768;

    beforeEach(async () => {
      mlkem768 = new MlKem768();
      keyPair768 = await mlkem768.generateKeyPair();
    });

    it('should generate ML-KEM-768 key pairs with correct sizes', () => {
      expect(keyPair768).to.be.an('array');
      expect(keyPair768).to.have.lengthOf(2);
      
      // FIPS 203 ML-KEM-768 key sizes
      const [publicKey, privateKey] = keyPair768;
      expect(publicKey).to.have.lengthOf(1184); // bytes
      expect(privateKey).to.have.lengthOf(2400); // bytes
    });

    it('should perform encapsulation and decapsulation successfully', async () => {
      const [publicKey, privateKey] = keyPair768;
      
      const [ciphertext, sharedSecret1] = await mlkem768.encap(publicKey);
      const sharedSecret2 = await mlkem768.decap(ciphertext, privateKey);
      
      expect(sharedSecret1).to.deep.equal(sharedSecret2);
      expect(sharedSecret1).to.have.lengthOf(32); // 256-bit shared secret
    });
  });

  describe('Key Exchange Simulation', () => {
    it('should simulate 1:1 call key exchange with ML-KEM-1024', async () => {
      // Create ML-KEM instances for Alice and Bob
      const aliceMlkem = new MlKem1024();
      const bobMlkem = new MlKem1024();
      
      // Alice and Bob generate key pairs
      const aliceKeyPair = await aliceMlkem.generateKeyPair();
      const bobKeyPair = await bobMlkem.generateKeyPair();
      
      const [alicePublicKey, alicePrivateKey] = aliceKeyPair;
      const [bobPublicKey, bobPrivateKey] = bobKeyPair;
      
      // Alice encapsulates using Bob's public key
      const [aliceCiphertext, aliceSharedSecret] = await aliceMlkem.encap(bobPublicKey);
      
      // Bob decapsulates Alice's ciphertext
      const bobSharedSecret = await bobMlkem.decap(aliceCiphertext, bobPrivateKey);
      
      // Both should have the same shared secret
      expect(aliceSharedSecret).to.deep.equal(bobSharedSecret);
      
      // Bob encapsulates using Alice's public key
      const [bobCiphertext, bobSharedSecret2] = await bobMlkem.encap(alicePublicKey);
      
      // Alice decapsulates Bob's ciphertext
      const aliceSharedSecret2 = await aliceMlkem.decap(bobCiphertext, alicePrivateKey);
      
      // Both should have the same shared secret for the second exchange
      expect(bobSharedSecret2).to.deep.equal(aliceSharedSecret2);
      
      // The two exchanges should produce different secrets (forward secrecy)
      expect(aliceSharedSecret).to.not.deep.equal(aliceSharedSecret2);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should benchmark ML-KEM-1024 operations', async () => {
      const iterations = 10;
      const mlkem = new MlKem1024();
      
      // Benchmark key generation
      const keygenStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await mlkem.generateKeyPair();
      }
      const keygenTime = performance.now() - keygenStart;
      
      // Benchmark encapsulation/decapsulation
      const keyPair = await mlkem.generateKeyPair();
      const [publicKey, privateKey] = keyPair;
      const encapStart = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const [ciphertext, sharedSecret] = await mlkem.encap(publicKey);
        await mlkem.decap(ciphertext, privateKey);
      }
      const encapTime = performance.now() - encapStart;
      
      console.log(`ML-KEM-1024 Performance (${iterations} iterations):`);
      console.log(`  Key Generation: ${(keygenTime / iterations).toFixed(2)}ms per operation`);
      console.log(`  Encap/Decap: ${(encapTime / iterations).toFixed(2)}ms per operation`);
      
      // Performance should be reasonable for real-time calls
      expect(keygenTime / iterations).to.be.lessThan(100); // < 100ms per keygen
      expect(encapTime / iterations).to.be.lessThan(50);   // < 50ms per encap/decap
    });
  });
});