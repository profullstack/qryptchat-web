/**
 * @fileoverview ML-KEM Post-Quantum Cryptography Module
 * Implements FIPS 203 compliant ML-KEM key encapsulation for E2EE voice calls
 * Supports ML-KEM-1024 (primary) and ML-KEM-768 (backward compatibility)
 */

import { MlKem1024, MlKem768 } from 'mlkem';
import { sha3_256 } from 'mlkem';

/**
 * ML-KEM parameter sets as defined in FIPS 203
 */
export const ML_KEM_PARAMS = {
  ML_KEM_1024: {
    name: 'ML-KEM-1024',
    publicKeySize: 1568,
    privateKeySize: 3168,
    ciphertextSize: 1568,
    sharedSecretSize: 32,
    securityLevel: 256 // bits
  },
  ML_KEM_768: {
    name: 'ML-KEM-768', 
    publicKeySize: 1184,
    privateKeySize: 2400,
    ciphertextSize: 1088,
    sharedSecretSize: 32,
    securityLevel: 192 // bits
  }
};

/**
 * ML-KEM Key Exchange Manager
 * Handles post-quantum key generation, encapsulation, and decapsulation
 */
export class MLKEMKeyExchange {
  constructor(parameterSet = 'ML_KEM_1024') {
    this.parameterSet = parameterSet;
    this.params = ML_KEM_PARAMS[parameterSet];
    
    if (!this.params) {
      throw new Error(`Unsupported ML-KEM parameter set: ${parameterSet}`);
    }
    
    // Initialize the appropriate ML-KEM instance
    this.mlkem = parameterSet === 'ML_KEM_1024' ? new MlKem1024() : new MlKem768();
  }

  /**
   * Generate a new ML-KEM key pair
   * @returns {Promise<{publicKey: Uint8Array, privateKey: Uint8Array}>}
   */
  async generateKeyPair() {
    try {
      const keyPair = await this.mlkem.generateKeyPair();
      const [publicKey, privateKey] = keyPair;
      
      // Validate key sizes
      if (publicKey.length !== this.params.publicKeySize) {
        throw new Error(`Invalid public key size: expected ${this.params.publicKeySize}, got ${publicKey.length}`);
      }
      
      if (privateKey.length !== this.params.privateKeySize) {
        throw new Error(`Invalid private key size: expected ${this.params.privateKeySize}, got ${privateKey.length}`);
      }
      
      return { publicKey, privateKey };
    } catch (error) {
      throw new Error(`ML-KEM key generation failed: ${error.message}`);
    }
  }

  /**
   * Encapsulate a shared secret using the recipient's public key
   * @param {Uint8Array} publicKey - Recipient's public key
   * @returns {Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}>}
   */
  async encapsulate(publicKey) {
    try {
      if (publicKey.length !== this.params.publicKeySize) {
        throw new Error(`Invalid public key size: expected ${this.params.publicKeySize}, got ${publicKey.length}`);
      }
      
      const result = await this.mlkem.encap(publicKey);
      const [ciphertext, sharedSecret] = result;
      
      // Validate result sizes
      if (sharedSecret.length !== this.params.sharedSecretSize) {
        throw new Error(`Invalid shared secret size: expected ${this.params.sharedSecretSize}, got ${sharedSecret.length}`);
      }
      
      return { ciphertext, sharedSecret };
    } catch (error) {
      throw new Error(`ML-KEM encapsulation failed: ${error.message}`);
    }
  }

  /**
   * Decapsulate the shared secret using the private key
   * @param {Uint8Array} ciphertext - Encapsulated ciphertext
   * @param {Uint8Array} privateKey - Private key for decapsulation
   * @returns {Promise<Uint8Array>} - Shared secret
   */
  async decapsulate(ciphertext, privateKey) {
    try {
      if (privateKey.length !== this.params.privateKeySize) {
        throw new Error(`Invalid private key size: expected ${this.params.privateKeySize}, got ${privateKey.length}`);
      }
      
      const sharedSecret = await this.mlkem.decap(ciphertext, privateKey);
      
      if (sharedSecret.length !== this.params.sharedSecretSize) {
        throw new Error(`Invalid shared secret size: expected ${this.params.sharedSecretSize}, got ${sharedSecret.length}`);
      }
      
      return sharedSecret;
    } catch (error) {
      throw new Error(`ML-KEM decapsulation failed: ${error.message}`);
    }
  }

  /**
   * Derive SRTP/SFrame keys from ML-KEM shared secret
   * Uses HKDF-like key derivation with SHA3-256
   * @param {Uint8Array} sharedSecret - ML-KEM shared secret
   * @param {string} context - Key derivation context (e.g., 'SRTP', 'SFrame')
   * @param {number} keyLength - Desired key length in bytes
   * @returns {Uint8Array} - Derived key
   */
  deriveKey(sharedSecret, context, keyLength = 32) {
    try {
      if (sharedSecret.length !== this.params.sharedSecretSize) {
        throw new Error(`Invalid shared secret size: expected ${this.params.sharedSecretSize}, got ${sharedSecret.length}`);
      }
      
      // Create key derivation input: sharedSecret || context || keyLength
      const contextBytes = new TextEncoder().encode(context);
      const lengthBytes = new Uint8Array(4);
      new DataView(lengthBytes.buffer).setUint32(0, keyLength, false); // big-endian
      
      const input = new Uint8Array(sharedSecret.length + contextBytes.length + lengthBytes.length);
      input.set(sharedSecret, 0);
      input.set(contextBytes, sharedSecret.length);
      input.set(lengthBytes, sharedSecret.length + contextBytes.length);
      
      // Use SHA3-256 for key derivation
      const derivedKey = sha3_256(input);
      
      // Truncate or extend to desired length
      if (keyLength <= derivedKey.length) {
        return derivedKey.slice(0, keyLength);
      } else {
        // For longer keys, use multiple rounds
        const result = new Uint8Array(keyLength);
        let offset = 0;
        let counter = 0;
        
        while (offset < keyLength) {
          const counterBytes = new Uint8Array(4);
          new DataView(counterBytes.buffer).setUint32(0, counter, false);
          
          const roundInput = new Uint8Array(input.length + counterBytes.length);
          roundInput.set(input, 0);
          roundInput.set(counterBytes, input.length);
          
          const roundOutput = sha3_256(roundInput);
          const copyLength = Math.min(roundOutput.length, keyLength - offset);
          result.set(roundOutput.slice(0, copyLength), offset);
          
          offset += copyLength;
          counter++;
        }
        
        return result;
      }
    } catch (error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * Get parameter set information
   * @returns {Object} - Parameter set details
   */
  getParams() {
    return { ...this.params, parameterSet: this.parameterSet };
  }
}

/**
 * Call Key Exchange Manager
 * Manages ML-KEM key exchange for voice/video calls with fallback support
 */
export class CallKeyExchange {
  constructor() {
    this.supportedParams = ['ML_KEM_1024'];
    this.preferredParam = 'ML_KEM_1024';
  }

  /**
   * Create ML-KEM instance with parameter negotiation
   * @param {string[]} peerSupportedParams - Peer's supported parameter sets
   * @returns {MLKEMKeyExchange} - Negotiated ML-KEM instance
   */
  negotiate(peerSupportedParams = ['ML_KEM_1024']) {
    // Only support ML-KEM-1024 (no fallbacks)
    if (!peerSupportedParams.includes('ML_KEM_1024')) {
      throw new Error('ML-KEM-1024 not supported by peer');
    }
    
    return new MLKEMKeyExchange('ML_KEM_1024');
  }

  /**
   * Generate call session keys from ML-KEM shared secret
   * @param {Uint8Array} sharedSecret - ML-KEM shared secret
   * @param {string} callId - Unique call identifier
   * @returns {Object} - Derived keys for SRTP and SFrame
   */
  deriveCallKeys(sharedSecret, callId) {
    const mlkem = new MLKEMKeyExchange(); // Use default ML-KEM-1024
    
    // Derive different keys for different purposes
    const srtpKey = mlkem.deriveKey(sharedSecret, `SRTP-${callId}`, 32);
    const srtpSalt = mlkem.deriveKey(sharedSecret, `SRTP-SALT-${callId}`, 14);
    const sframeKey = mlkem.deriveKey(sharedSecret, `SFrame-${callId}`, 32);
    
    return {
      srtp: {
        key: srtpKey,
        salt: srtpSalt
      },
      sframe: {
        key: sframeKey
      }
    };
  }

  /**
   * Generate Group Call Key (GCK) for encrypted group calls
   * @returns {Uint8Array} - 256-bit Group Call Key
   */
  generateGroupCallKey() {
    // Generate a secure random 256-bit key for group calls
    const gck = new Uint8Array(32);
    crypto.getRandomValues(gck);
    return gck;
  }

  /**
   * Encrypt Group Call Key for a participant using their ML-KEM public key
   * @param {Uint8Array} groupCallKey - Group Call Key to encrypt
   * @param {Uint8Array} participantPublicKey - Participant's ML-KEM public key
   * @returns {Promise<{ciphertext: Uint8Array, encryptedGCK: Uint8Array}>}
   */
  async encryptGroupCallKey(groupCallKey, participantPublicKey) {
    const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
    
    // Encapsulate to get shared secret
    const { ciphertext, sharedSecret } = await mlkem.encapsulate(participantPublicKey);
    
    // Use shared secret to encrypt the GCK
    const encryptedGCK = this.xorEncrypt(groupCallKey, sharedSecret);
    
    return { ciphertext, encryptedGCK };
  }

  /**
   * Decrypt Group Call Key using participant's private key
   * @param {Uint8Array} encryptedGCK - Encrypted Group Call Key
   * @param {Uint8Array} ciphertext - ML-KEM ciphertext
   * @param {Uint8Array} participantPrivateKey - Participant's ML-KEM private key
   * @returns {Promise<Uint8Array>} - Decrypted Group Call Key
   */
  async decryptGroupCallKey(encryptedGCK, ciphertext, participantPrivateKey) {
    const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
    
    // Decapsulate to get shared secret
    const sharedSecret = await mlkem.decapsulate(ciphertext, participantPrivateKey);
    
    // Decrypt the GCK using the shared secret
    const groupCallKey = this.xorEncrypt(encryptedGCK, sharedSecret);
    
    return groupCallKey;
  }

  /**
   * Simple XOR encryption for GCK (secure since we use ML-KEM derived keys)
   * @param {Uint8Array} data - Data to encrypt/decrypt
   * @param {Uint8Array} key - Encryption key (32 bytes)
   * @returns {Uint8Array} - Encrypted/decrypted data
   */
  xorEncrypt(data, key) {
    if (data.length !== 32 || key.length !== 32) {
      throw new Error('Both data and key must be 32 bytes for GCK encryption');
    }
    
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = data[i] ^ key[i];
    }
    return result;
  }

  /**
   * Derive per-participant keys from Group Call Key
   * @param {Uint8Array} groupCallKey - Group Call Key
   * @param {string} participantId - Participant ID
   * @param {string} callId - Call ID
   * @returns {Object} - Derived keys for this participant
   */
  deriveParticipantKeys(groupCallKey, participantId, callId) {
    const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
    
    // Derive unique keys for this participant
    const srtpKey = mlkem.deriveKey(groupCallKey, `GROUP-SRTP-${participantId}-${callId}`, 32);
    const srtpSalt = mlkem.deriveKey(groupCallKey, `GROUP-SRTP-SALT-${participantId}-${callId}`, 14);
    const sframeKey = mlkem.deriveKey(groupCallKey, `GROUP-SFrame-${participantId}-${callId}`, 32);
    
    return {
      srtp: {
        key: srtpKey,
        salt: srtpSalt
      },
      sframe: {
        key: sframeKey
      }
    };
  }

  /**
   * Get supported parameter sets
   * @returns {string[]} - List of supported parameter sets
   */
  getSupportedParams() {
    return [...this.supportedParams];
  }
}

/**
 * Utility functions for ML-KEM operations
 */
export const MLKEMUtils = {
  /**
   * Convert Uint8Array to base64 string for transmission
   * @param {Uint8Array} data - Binary data
   * @returns {string} - Base64 encoded string
   */
  toBase64(data) {
    return btoa(String.fromCharCode(...data));
  },

  /**
   * Convert base64 string back to Uint8Array
   * @param {string} base64 - Base64 encoded string
   * @returns {Uint8Array} - Binary data
   */
  fromBase64(base64) {
    const binary = atob(base64);
    return new Uint8Array(binary.split('').map(char => char.charCodeAt(0)));
  },

  /**
   * Securely compare two byte arrays in constant time
   * @param {Uint8Array} a - First array
   * @param {Uint8Array} b - Second array
   * @returns {boolean} - True if arrays are equal
   */
  constantTimeEqual(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    
    return result === 0;
  }
};