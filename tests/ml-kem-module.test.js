/**
 * @fileoverview ML-KEM Module Tests
 * Tests for the ML-KEM cryptographic module used in voice calls
 */

import { expect, describe, it, beforeEach } from 'vitest';
import { 
  MLKEMKeyExchange, 
  CallKeyExchange, 
  MLKEMUtils,
  ML_KEM_PARAMS 
} from '../src/lib/crypto/ml-kem.js';

describe('ML-KEM Cryptographic Module', () => {
  describe('MLKEMKeyExchange', () => {
    let mlkem1024;
    let mlkem768;

    beforeEach(() => {
      mlkem1024 = new MLKEMKeyExchange('ML_KEM_1024');
      mlkem768 = new MLKEMKeyExchange('ML_KEM_768');
    });

    it('should initialize with correct parameters', () => {
      expect(mlkem1024.parameterSet).toBe('ML_KEM_1024');
      expect(mlkem1024.params).toEqual(ML_KEM_PARAMS.ML_KEM_1024);
      
      expect(mlkem768.parameterSet).toBe('ML_KEM_768');
      expect(mlkem768.params).toEqual(ML_KEM_PARAMS.ML_KEM_768);
    });

    it('should throw error for unsupported parameter set', () => {
      expect(() => {
        new MLKEMKeyExchange('INVALID_PARAM');
      }).toThrow('Unsupported ML-KEM parameter set: INVALID_PARAM');
    });

    it('should generate valid key pairs for ML-KEM-1024', async () => {
      const keyPair = await mlkem1024.generateKeyPair();
      
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(1568);
      expect(keyPair.privateKey.length).toBe(3168);
    });

    it('should generate valid key pairs for ML-KEM-768', async () => {
      const keyPair = await mlkem768.generateKeyPair();
      
      expect(keyPair.publicKey.length).toBe(1184);
      expect(keyPair.privateKey.length).toBe(2400);
    });

    it('should perform successful encapsulation and decapsulation', async () => {
      const keyPair = await mlkem1024.generateKeyPair();
      
      // Encapsulate
      const { ciphertext, sharedSecret: secret1 } = await mlkem1024.encapsulate(keyPair.publicKey);
      expect(ciphertext).toBeInstanceOf(Uint8Array);
      expect(secret1).toBeInstanceOf(Uint8Array);
      expect(secret1.length).toBe(32);
      
      // Decapsulate
      const secret2 = await mlkem1024.decapsulate(ciphertext, keyPair.privateKey);
      expect(secret2).toBeInstanceOf(Uint8Array);
      expect(secret2.length).toBe(32);
      
      // Secrets should match
      expect(secret1).toEqual(secret2);
    });

    it('should derive consistent keys from shared secret', async () => {
      const keyPair = await mlkem1024.generateKeyPair();
      const { sharedSecret } = await mlkem1024.encapsulate(keyPair.publicKey);
      
      // Derive keys with same parameters
      const key1 = mlkem1024.deriveKey(sharedSecret, 'SRTP', 32);
      const key2 = mlkem1024.deriveKey(sharedSecret, 'SRTP', 32);
      
      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });

    it('should derive different keys for different contexts', async () => {
      const keyPair = await mlkem1024.generateKeyPair();
      const { sharedSecret } = await mlkem1024.encapsulate(keyPair.publicKey);
      
      const srtpKey = mlkem1024.deriveKey(sharedSecret, 'SRTP', 32);
      const sframeKey = mlkem1024.deriveKey(sharedSecret, 'SFrame', 32);
      
      expect(srtpKey).not.toEqual(sframeKey);
    });

    it('should derive keys of different lengths', async () => {
      const keyPair = await mlkem1024.generateKeyPair();
      const { sharedSecret } = await mlkem1024.encapsulate(keyPair.publicKey);
      
      const key16 = mlkem1024.deriveKey(sharedSecret, 'TEST', 16);
      const key32 = mlkem1024.deriveKey(sharedSecret, 'TEST', 32);
      const key64 = mlkem1024.deriveKey(sharedSecret, 'TEST', 64);
      
      expect(key16.length).toBe(16);
      expect(key32.length).toBe(32);
      expect(key64.length).toBe(64);
      
      // Keys should be different for different lengths (different derivation)
      expect(key16).not.toEqual(key32.slice(0, 16));
      expect(key32).not.toEqual(key64.slice(0, 32));
    });

    it('should return correct parameter information', () => {
      const params1024 = mlkem1024.getParams();
      expect(params1024.parameterSet).toBe('ML_KEM_1024');
      expect(params1024.publicKeySize).toBe(1568);
      expect(params1024.securityLevel).toBe(256);
      
      const params768 = mlkem768.getParams();
      expect(params768.parameterSet).toBe('ML_KEM_768');
      expect(params768.publicKeySize).toBe(1184);
      expect(params768.securityLevel).toBe(192);
    });
  });

  describe('CallKeyExchange', () => {
    let callKeyExchange;

    beforeEach(() => {
      callKeyExchange = new CallKeyExchange();
    });

    it('should negotiate ML-KEM-1024 when both support it', () => {
      const mlkem = callKeyExchange.negotiate(['ML_KEM_1024', 'ML_KEM_768']);
      expect(mlkem.parameterSet).toBe('ML_KEM_1024');
    });

    it('should fallback to ML-KEM-768 when 1024 not supported', () => {
      const mlkem = callKeyExchange.negotiate(['ML_KEM_768']);
      expect(mlkem.parameterSet).toBe('ML_KEM_768');
    });

    it('should throw error when no mutual support', () => {
      expect(() => {
        callKeyExchange.negotiate(['UNSUPPORTED']);
      }).toThrow('No mutually supported ML-KEM parameter sets');
    });

    it('should derive call keys correctly', async () => {
      const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
      const keyPair = await mlkem.generateKeyPair();
      const { sharedSecret } = await mlkem.encapsulate(keyPair.publicKey);
      
      const callKeys = callKeyExchange.deriveCallKeys(sharedSecret, 'test-call-123');
      
      expect(callKeys).toHaveProperty('srtp');
      expect(callKeys).toHaveProperty('sframe');
      expect(callKeys.srtp).toHaveProperty('key');
      expect(callKeys.srtp).toHaveProperty('salt');
      expect(callKeys.sframe).toHaveProperty('key');
      
      expect(callKeys.srtp.key.length).toBe(32);
      expect(callKeys.srtp.salt.length).toBe(14);
      expect(callKeys.sframe.key.length).toBe(32);
    });

    it('should return supported parameters', () => {
      const supported = callKeyExchange.getSupportedParams();
      expect(supported).toEqual(['ML_KEM_1024', 'ML_KEM_768']);
    });
  });

  describe('MLKEMUtils', () => {
    it('should convert to and from base64 correctly', () => {
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0]);
      const base64 = MLKEMUtils.toBase64(originalData);
      const convertedBack = MLKEMUtils.fromBase64(base64);
      
      expect(convertedBack).toEqual(originalData);
    });

    it('should perform constant time comparison correctly', () => {
      const data1 = new Uint8Array([1, 2, 3, 4]);
      const data2 = new Uint8Array([1, 2, 3, 4]);
      const data3 = new Uint8Array([1, 2, 3, 5]);
      const data4 = new Uint8Array([1, 2, 3]);
      
      expect(MLKEMUtils.constantTimeEqual(data1, data2)).toBe(true);
      expect(MLKEMUtils.constantTimeEqual(data1, data3)).toBe(false);
      expect(MLKEMUtils.constantTimeEqual(data1, data4)).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should simulate complete call key exchange', async () => {
      // Alice and Bob create their key exchange managers
      const aliceCallKE = new CallKeyExchange();
      const bobCallKE = new CallKeyExchange();
      
      // Negotiate parameters (both support ML-KEM-1024)
      const aliceMLKEM = aliceCallKE.negotiate(['ML_KEM_1024']);
      const bobMLKEM = bobCallKE.negotiate(['ML_KEM_1024']);
      
      // Alice generates key pair
      const aliceKeyPair = await aliceMLKEM.generateKeyPair();
      
      // Bob encapsulates using Alice's public key
      const { ciphertext, sharedSecret: bobSecret } = await bobMLKEM.encapsulate(aliceKeyPair.publicKey);
      
      // Alice decapsulates to get the same shared secret
      const aliceSecret = await aliceMLKEM.decapsulate(ciphertext, aliceKeyPair.privateKey);
      
      // Both should have the same shared secret
      expect(aliceSecret).toEqual(bobSecret);
      
      // Both derive the same call keys
      const callId = 'test-call-456';
      const aliceCallKeys = aliceCallKE.deriveCallKeys(aliceSecret, callId);
      const bobCallKeys = bobCallKE.deriveCallKeys(bobSecret, callId);
      
      expect(aliceCallKeys.srtp.key).toEqual(bobCallKeys.srtp.key);
      expect(aliceCallKeys.srtp.salt).toEqual(bobCallKeys.srtp.salt);
      expect(aliceCallKeys.sframe.key).toEqual(bobCallKeys.sframe.key);
    });

    it('should handle backward compatibility scenario', async () => {
      // Alice supports both, Bob only supports ML-KEM-768
      const aliceCallKE = new CallKeyExchange();
      const bobCallKE = new CallKeyExchange();
      
      const aliceMLKEM = aliceCallKE.negotiate(['ML_KEM_768']); // Negotiated down
      const bobMLKEM = bobCallKE.negotiate(['ML_KEM_768']);
      
      expect(aliceMLKEM.parameterSet).toBe('ML_KEM_768');
      expect(bobMLKEM.parameterSet).toBe('ML_KEM_768');
      
      // Key exchange should still work
      const aliceKeyPair = await aliceMLKEM.generateKeyPair();
      const { ciphertext, sharedSecret: bobSecret } = await bobMLKEM.encapsulate(aliceKeyPair.publicKey);
      const aliceSecret = await aliceMLKEM.decapsulate(ciphertext, aliceKeyPair.privateKey);
      
      expect(aliceSecret).toEqual(bobSecret);
    });
  });
});