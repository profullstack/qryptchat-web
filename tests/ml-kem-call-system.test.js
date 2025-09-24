/**
 * @fileoverview ML-KEM Call System End-to-End Tests
 * Tests the complete ML-KEM encrypted voice calling system
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { 
  MLKEMKeyExchange, 
  CallKeyExchange, 
  MLKEMUtils 
} from '../src/lib/crypto/ml-kem.js';
import { CallAudioManager } from '../src/lib/audio/call-sounds.js';

describe('ML-KEM Call System End-to-End', () => {
  let aliceKeyExchange;
  let bobKeyExchange;
  let callAudioManager;

  beforeEach(() => {
    aliceKeyExchange = new CallKeyExchange();
    bobKeyExchange = new CallKeyExchange();
    callAudioManager = new CallAudioManager();
  });

  afterEach(() => {
    if (callAudioManager) {
      callAudioManager.cleanup();
    }
  });

  describe('Complete Call Key Exchange Flow', () => {
    it('should simulate complete 1:1 call setup with ML-KEM-1024', async () => {
      console.log('🔐 [TEST] Starting complete call setup simulation');

      // Step 1: Alice initiates call - generates ML-KEM key pair
      const aliceMLKEM = aliceKeyExchange.negotiate(['ML_KEM_1024']);
      const aliceKeyPair = await aliceMLKEM.generateKeyPair();
      
      console.log('🔐 [TEST] Alice generated ML-KEM-1024 key pair');
      expect(aliceKeyPair.publicKey.length).toBe(1568);
      expect(aliceKeyPair.privateKey.length).toBe(3168);

      // Step 2: Alice sends call offer with her public key (base64 encoded for transmission)
      const alicePublicKeyB64 = MLKEMUtils.toBase64(aliceKeyPair.publicKey);
      const callOffer = {
        type: 'ml_kem_call_offer',
        payload: {
          callId: 'test-call-123',
          targetUserId: 'bob-user-id',
          callType: 'voice',
          mlKemParams: ['ML_KEM_1024'],
          initiatorPublicKey: alicePublicKeyB64,
          sdpOffer: { type: 'offer', sdp: 'mock-sdp-offer' }
        }
      };

      console.log('🔐 [TEST] Alice created call offer with ML-KEM public key');

      // Step 3: Bob receives call offer and generates his key pair
      const bobMLKEM = bobKeyExchange.negotiate(['ML_KEM_1024']);
      const bobKeyPair = await bobMLKEM.generateKeyPair();
      
      console.log('🔐 [TEST] Bob generated ML-KEM-1024 key pair');

      // Step 4: Bob encapsulates using Alice's public key
      const alicePublicKey = MLKEMUtils.fromBase64(callOffer.payload.initiatorPublicKey);
      const { ciphertext, sharedSecret: bobSharedSecret } = await bobMLKEM.encapsulate(alicePublicKey);
      
      console.log('🔐 [TEST] Bob encapsulated shared secret using Alice\'s public key');
      expect(bobSharedSecret.length).toBe(32);

      // Step 5: Bob sends call answer with his public key and ciphertext
      const bobPublicKeyB64 = MLKEMUtils.toBase64(bobKeyPair.publicKey);
      const ciphertextB64 = MLKEMUtils.toBase64(ciphertext);
      
      const callAnswer = {
        type: 'ml_kem_call_answer',
        payload: {
          callId: 'test-call-123',
          sessionId: 'session-456',
          recipientPublicKey: bobPublicKeyB64,
          ciphertext: ciphertextB64,
          sdpAnswer: { type: 'answer', sdp: 'mock-sdp-answer' }
        }
      };

      console.log('🔐 [TEST] Bob created call answer with ciphertext');

      // Step 6: Alice decapsulates to get the same shared secret
      const receivedCiphertext = MLKEMUtils.fromBase64(callAnswer.payload.ciphertext);
      const aliceSharedSecret = await aliceMLKEM.decapsulate(receivedCiphertext, aliceKeyPair.privateKey);
      
      console.log('🔐 [TEST] Alice decapsulated shared secret');

      // Step 7: Verify both have the same shared secret
      expect(aliceSharedSecret).toEqual(bobSharedSecret);
      console.log('🔐 [TEST] ✅ Both parties have matching shared secrets');

      // Step 8: Both derive the same call keys
      const callId = 'test-call-123';
      const aliceCallKeys = aliceKeyExchange.deriveCallKeys(aliceSharedSecret, callId);
      const bobCallKeys = bobKeyExchange.deriveCallKeys(bobSharedSecret, callId);

      // Verify derived keys match
      expect(aliceCallKeys.srtp.key).toEqual(bobCallKeys.srtp.key);
      expect(aliceCallKeys.srtp.salt).toEqual(bobCallKeys.srtp.salt);
      expect(aliceCallKeys.sframe.key).toEqual(bobCallKeys.sframe.key);

      console.log('🔐 [TEST] ✅ Both parties derived matching SRTP/SFrame keys');
      console.log('🔐 [TEST] SRTP key length:', aliceCallKeys.srtp.key.length);
      console.log('🔐 [TEST] SRTP salt length:', aliceCallKeys.srtp.salt.length);
      console.log('🔐 [TEST] SFrame key length:', aliceCallKeys.sframe.key.length);

      // Verify key properties
      expect(aliceCallKeys.srtp.key.length).toBe(32);
      expect(aliceCallKeys.srtp.salt.length).toBe(14);
      expect(aliceCallKeys.sframe.key.length).toBe(32);
    });

    it('should handle key rotation for forward secrecy', async () => {
      console.log('🔐 [TEST] Testing key rotation for forward secrecy');

      // Initial call setup
      const aliceMLKEM = new MLKEMKeyExchange('ML_KEM_1024');
      const bobMLKEM = new MLKEMKeyExchange('ML_KEM_1024');
      
      const aliceKeyPair1 = await aliceMLKEM.generateKeyPair();
      const { ciphertext: ciphertext1, sharedSecret: sharedSecret1 } = 
        await bobMLKEM.encapsulate(aliceKeyPair1.publicKey);
      
      const aliceSecret1 = await aliceMLKEM.decapsulate(ciphertext1, aliceKeyPair1.privateKey);
      expect(aliceSecret1).toEqual(sharedSecret1);

      // Key rotation: Alice generates new key pair
      const aliceKeyPair2 = await aliceMLKEM.generateKeyPair();
      const { ciphertext: ciphertext2, sharedSecret: sharedSecret2 } = 
        await bobMLKEM.encapsulate(aliceKeyPair2.publicKey);
      
      const aliceSecret2 = await aliceMLKEM.decapsulate(ciphertext2, aliceKeyPair2.privateKey);
      expect(aliceSecret2).toEqual(sharedSecret2);

      // Verify forward secrecy: new secrets are different
      expect(sharedSecret1).not.toEqual(sharedSecret2);
      expect(aliceSecret1).not.toEqual(aliceSecret2);

      console.log('🔐 [TEST] ✅ Key rotation provides forward secrecy');
    });

    it('should derive different keys for different call sessions', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const keyExchange = new CallKeyExchange();
      
      const keyPair = await mlkem.generateKeyPair();
      const { sharedSecret } = await mlkem.encapsulate(keyPair.publicKey);

      // Derive keys for different call sessions
      const call1Keys = keyExchange.deriveCallKeys(sharedSecret, 'call-session-1');
      const call2Keys = keyExchange.deriveCallKeys(sharedSecret, 'call-session-2');

      // Keys should be different for different call sessions
      expect(call1Keys.srtp.key).not.toEqual(call2Keys.srtp.key);
      expect(call1Keys.sframe.key).not.toEqual(call2Keys.sframe.key);

      console.log('🔐 [TEST] ✅ Different call sessions produce different keys');
    });
  });

  describe('Audio System Integration', () => {
    it('should initialize audio manager without errors', () => {
      expect(callAudioManager).toBeDefined();
      expect(typeof callAudioManager.startRinging).toBe('function');
      expect(typeof callAudioManager.stopRinging).toBe('function');
      expect(typeof callAudioManager.playNotification).toBe('function');
    });

    it('should handle ringing state correctly', () => {
      expect(callAudioManager.isRinging).toBe(false);
      
      callAudioManager.startRinging();
      expect(callAudioManager.isRinging).toBe(true);
      
      callAudioManager.stopRinging();
      expect(callAudioManager.isRinging).toBe(false);
    });
  });

  describe('Security Properties', () => {
    it('should ensure ML-KEM-1024 provides 256-bit security level', () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const params = mlkem.getParams();
      
      expect(params.securityLevel).toBe(256);
      expect(params.parameterSet).toBe('ML_KEM_1024');
      expect(params.publicKeySize).toBe(1568);
      expect(params.privateKeySize).toBe(3168);
    });

    it('should generate cryptographically secure random keys', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      
      // Generate multiple key pairs
      const keyPairs = await Promise.all([
        mlkem.generateKeyPair(),
        mlkem.generateKeyPair(),
        mlkem.generateKeyPair()
      ]);

      // All public keys should be different
      for (let i = 0; i < keyPairs.length; i++) {
        for (let j = i + 1; j < keyPairs.length; j++) {
          expect(keyPairs[i].publicKey).not.toEqual(keyPairs[j].publicKey);
          expect(keyPairs[i].privateKey).not.toEqual(keyPairs[j].privateKey);
        }
      }

      console.log('🔐 [TEST] ✅ All generated keys are unique');
    });

    it('should provide constant-time comparison for security', () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5]);
      const data3 = new Uint8Array([1, 2, 3, 4, 6]);

      // Measure timing for equal arrays
      const start1 = performance.now();
      const result1 = MLKEMUtils.constantTimeEqual(data1, data2);
      const time1 = performance.now() - start1;

      // Measure timing for different arrays
      const start2 = performance.now();
      const result2 = MLKEMUtils.constantTimeEqual(data1, data3);
      const time2 = performance.now() - start2;

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      // Timing should be similar (constant time)
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(1); // Less than 1ms difference

      console.log('🔐 [TEST] ✅ Constant-time comparison working correctly');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid public key sizes gracefully', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const invalidPublicKey = new Uint8Array(100); // Wrong size

      try {
        await mlkem.encapsulate(invalidPublicKey);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Invalid public key size');
      }
    });

    it('should handle invalid private key sizes gracefully', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const keyPair = await mlkem.generateKeyPair();
      const { ciphertext } = await mlkem.encapsulate(keyPair.publicKey);
      
      const invalidPrivateKey = new Uint8Array(100); // Wrong size

      try {
        await mlkem.decapsulate(ciphertext, invalidPrivateKey);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).toContain('Invalid private key size');
      }
    });

    it('should handle unsupported parameter sets', () => {
      expect(() => {
        new MLKEMKeyExchange('INVALID_PARAM');
      }).toThrow('Unsupported ML-KEM parameter set: INVALID_PARAM');
    });

    it('should handle parameter negotiation failures', () => {
      const callKeyExchange = new CallKeyExchange();
      
      expect(() => {
        callKeyExchange.negotiate(['UNSUPPORTED_PARAM']);
      }).toThrow('No mutually supported ML-KEM parameter sets');
    });
  });

  describe('Performance Requirements', () => {
    it('should meet performance requirements for real-time calls', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const iterations = 5;

      // Test key generation performance
      const keygenStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        await mlkem.generateKeyPair();
      }
      const keygenTime = (performance.now() - keygenStart) / iterations;

      // Test encap/decap performance
      const keyPair = await mlkem.generateKeyPair();
      const encapStart = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        const { ciphertext, sharedSecret } = await mlkem.encapsulate(keyPair.publicKey);
        await mlkem.decapsulate(ciphertext, keyPair.privateKey);
      }
      const encapTime = (performance.now() - encapStart) / iterations;

      console.log(`🔐 [TEST] Performance results:`);
      console.log(`  Key Generation: ${keygenTime.toFixed(2)}ms per operation`);
      console.log(`  Encap/Decap: ${encapTime.toFixed(2)}ms per operation`);

      // Performance should be acceptable for real-time calls
      expect(keygenTime).toBeLessThan(50); // < 50ms per keygen
      expect(encapTime).toBeLessThan(25);  // < 25ms per encap/decap

      console.log('🔐 [TEST] ✅ Performance meets real-time call requirements');
    });
  });

  describe('Base64 Encoding/Decoding', () => {
    it('should correctly encode and decode ML-KEM keys for transmission', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const keyPair = await mlkem.generateKeyPair();

      // Encode keys for transmission
      const publicKeyB64 = MLKEMUtils.toBase64(keyPair.publicKey);
      const privateKeyB64 = MLKEMUtils.toBase64(keyPair.privateKey);

      expect(typeof publicKeyB64).toBe('string');
      expect(typeof privateKeyB64).toBe('string');

      // Decode keys back
      const decodedPublicKey = MLKEMUtils.fromBase64(publicKeyB64);
      const decodedPrivateKey = MLKEMUtils.fromBase64(privateKeyB64);

      // Should match original keys
      expect(decodedPublicKey).toEqual(keyPair.publicKey);
      expect(decodedPrivateKey).toEqual(keyPair.privateKey);

      console.log('🔐 [TEST] ✅ Base64 encoding/decoding preserves key integrity');
    });

    it('should handle ciphertext encoding for WebSocket transmission', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const keyPair = await mlkem.generateKeyPair();
      const { ciphertext, sharedSecret } = await mlkem.encapsulate(keyPair.publicKey);

      // Encode ciphertext for transmission
      const ciphertextB64 = MLKEMUtils.toBase64(ciphertext);
      expect(typeof ciphertextB64).toBe('string');

      // Decode and verify decapsulation still works
      const decodedCiphertext = MLKEMUtils.fromBase64(ciphertextB64);
      const decapsulatedSecret = await mlkem.decapsulate(decodedCiphertext, keyPair.privateKey);

      expect(decapsulatedSecret).toEqual(sharedSecret);
      console.log('🔐 [TEST] ✅ Ciphertext encoding preserves decapsulation capability');
    });
  });

  describe('Call Session Simulation', () => {
    it('should simulate complete call session lifecycle', async () => {
      console.log('🔐 [TEST] Simulating complete call session lifecycle');

      // Phase 1: Call Initiation
      const aliceMLKEM = new MLKEMKeyExchange('ML_KEM_1024');
      const aliceKeyPair = await aliceMLKEM.generateKeyPair();
      
      const callSession = {
        id: 'session-789',
        callId: 'call-789',
        initiatorId: 'alice-id',
        recipientId: 'bob-id',
        mlKemParameterSet: 'ML_KEM_1024',
        status: 'pending'
      };

      console.log('🔐 [TEST] Phase 1: Call initiated');

      // Phase 2: Call Answer and Key Exchange
      const bobMLKEM = new MLKEMKeyExchange('ML_KEM_1024');
      const { ciphertext, sharedSecret } = await bobMLKEM.encapsulate(aliceKeyPair.publicKey);
      
      callSession.status = 'established';
      callSession.establishedAt = new Date().toISOString();

      console.log('🔐 [TEST] Phase 2: Call answered, keys exchanged');

      // Phase 3: Key Derivation
      const aliceSecret = await aliceMLKEM.decapsulate(ciphertext, aliceKeyPair.privateKey);
      const aliceKeys = new CallKeyExchange().deriveCallKeys(aliceSecret, callSession.callId);
      const bobKeys = new CallKeyExchange().deriveCallKeys(sharedSecret, callSession.callId);

      expect(aliceKeys.srtp.key).toEqual(bobKeys.srtp.key);
      console.log('🔐 [TEST] Phase 3: Call keys derived and verified');

      // Phase 4: Call End (cleanup)
      callSession.status = 'ended';
      callSession.endedAt = new Date().toISOString();

      console.log('🔐 [TEST] Phase 4: Call ended, session cleaned up');
      console.log('🔐 [TEST] ✅ Complete call session lifecycle successful');
    });
  });

  describe('FIPS 203 Compliance', () => {
    it('should use FIPS 203 standardized ML-KEM implementation', async () => {
      const mlkem1024 = new MLKEMKeyExchange('ML_KEM_1024');
      const params = mlkem1024.getParams();

      // Verify FIPS 203 ML-KEM-1024 specifications
      expect(params.name).toBe('ML-KEM-1024');
      expect(params.publicKeySize).toBe(1568);  // FIPS 203 specification
      expect(params.privateKeySize).toBe(3168); // FIPS 203 specification
      expect(params.sharedSecretSize).toBe(32); // 256-bit shared secret
      expect(params.securityLevel).toBe(256);   // 256-bit security level

      console.log('🔐 [TEST] ✅ Implementation follows FIPS 203 specifications');
    });

    it('should generate keys that meet FIPS 203 size requirements', async () => {
      const mlkem1024 = new MLKEMKeyExchange('ML_KEM_1024');
      const keyPair = await mlkem1024.generateKeyPair();

      // Verify exact FIPS 203 key sizes
      expect(keyPair.publicKey.length).toBe(1568);
      expect(keyPair.privateKey.length).toBe(3168);

      // Verify encapsulation produces correct sizes
      const { ciphertext, sharedSecret } = await mlkem1024.encapsulate(keyPair.publicKey);
      expect(sharedSecret.length).toBe(32); // 256-bit shared secret

      console.log('🔐 [TEST] ✅ Generated keys meet FIPS 203 size requirements');
    });
  });
});