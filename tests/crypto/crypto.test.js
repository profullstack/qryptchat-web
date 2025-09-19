import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { postQuantumEncryption } from '../../src/lib/crypto/post-quantum-encryption';
import { Dilithium } from '../../src/lib/crypto/dilithium';
import { HKDF } from '../../src/lib/crypto/hkdf';
import { multiRecipientEncryption } from '../../src/lib/crypto/multi-recipient-encryption';
import { indexedDBManager } from '../../src/lib/crypto/indexed-db-manager';

// Mock the indexedDBManager for testing
const mockIndexedDB = {
  async get(key) {
    return this._store[key];
  },
  async set(key, value) {
    this._store[key] = value;
  },
  async delete(key) {
    delete this._store[key];
  },
  async clear() {
    this._store = {};
  },
  _store: {}
};

// Mock the global crypto object for testing
global.crypto = {
  getRandomValues: (arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
  subtle: {
    generateKey: async () => ({}),
    exportKey: async () => new Uint8Array(32),
    importKey: async () => ({}),
    encrypt: async () => new Uint8Array(64),
    decrypt: async () => new TextEncoder().encode('decrypted')
  }
};

/**
 * Creates a mock message for testing
 * @param {string} content - Message content
 * @param {string} senderId - Sender ID
 * @param {string} conversationId - Conversation ID
 * @returns {Object} Mock message object
 */
const createMockMessage = (content, senderId, conversationId) => ({
  id: `msg_${Math.random().toString(36).substr(2, 9)}`,
  content,
  sender_id: senderId,
  conversation_id: conversationId,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  status: 'sent'
});

describe('Full Crypto Workflow', () => {
  // Mock user data
  const mockUser1 = {
    id: 'user1',
    name: 'Test User 1',
    publicKey: new Uint8Array(32).fill(1)
  };
  
  const mockUser2 = {
    id: 'user2',
    name: 'Test User 2',
    publicKey: new Uint8Array(32).fill(2)
  };
  
  beforeAll(async () => {
    // Initialize IndexedDB mock
    await mockIndexedDB.clear();
    
    // Initialize services
    await postQuantumEncryption.initialize();
    await multiRecipientEncryption.initialize();
    
    // Mock public key storage
    await mockIndexedDB.set(`publicKey_${mockUser1.id}`, mockUser1.publicKey);
    await mockIndexedDB.set(`publicKey_${mockUser2.id}`, mockUser2.publicKey);
  });
  
  afterAll(async () => {
    // Clean up after tests
    await mockIndexedDB.clear();
  });

  it('should encrypt and decrypt a message successfully', async () => {
    const message = 'This is a secret message.';
    const encrypted = await postQuantumEncryption.encryptForRecipient(message, mockUser2.publicKey);
    const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, mockUser2.publicKey);
    expect(decrypted).toBe(message);
  });
  
  it('should handle decryption of messages with different formats', async () => {
    const testMessages = [
      'Simple message',
      'Message with special characters: !@#$%^&*()',
      'Message with emoji 😊',
      ' '.repeat(100), // Large message with spaces
      '', // Empty message
      JSON.stringify({ type: 'text', content: 'Complex message' })
    ];
    
    for (const message of testMessages) {
      const encrypted = await postQuantumEncryption.encryptForRecipient(message, mockUser2.publicKey);
      const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, mockUser2.publicKey);
      expect(decrypted).toBe(message);
    }
  });
  
  it('should handle decryption with multi-recipient encryption', async () => {
    const conversationId = 'test_conversation';
    const testMessage = createMockMessage('Test message', mockUser1.id, conversationId);
    
    // Mock the getPublicKeysForConversation function
    const originalGetPublicKeys = multiRecipientEncryption.getPublicKeysForConversation;
    multiRecipientEncryption.getPublicKeysForConversation = async () => ({
      [mockUser1.id]: mockUser1.publicKey,
      [mockUser2.id]: mockUser2.publicKey
    });
    
    try {
      // Encrypt for multiple recipients
      const encryptedMessage = await multiRecipientEncryption.encryptForConversation(
        conversationId,
        testMessage.content
      );
      
      // Simulate message receipt and decryption
      const decryptedContent = await postQuantumEncryption.decryptFromSender(
        encryptedMessage.encryptedContent,
        mockUser1.publicKey
      );
      
      expect(decryptedContent).toBe(testMessage.content);
    } finally {
      // Restore original function
      multiRecipientEncryption.getPublicKeysForConversation = originalGetPublicKeys;
    }
  });
  
  it('should handle decryption errors gracefully', async () => {
    const message = 'Test message';
    const encrypted = await postQuantumEncryption.encryptForRecipient(message, mockUser2.publicKey);
    
    // Test with invalid encrypted data
    await expect(postQuantumEncryption.decryptFromSender('invalid-encrypted-data', mockUser2.publicKey))
      .rejects.toThrow();
      
    // Test with wrong public key
    const wrongPublicKey = new Uint8Array(32).fill(255);
    await expect(postQuantumEncryption.decryptFromSender(encrypted, wrongPublicKey))
      .rejects.toThrow();
  });
  
  it('should handle large messages', async () => {
    // Generate a 10KB message (smaller than 1MB for test performance)
    const largeMessage = 'A'.repeat(10 * 1024);
    
    const encrypted = await postQuantumEncryption.encryptForRecipient(largeMessage, mockUser2.publicKey);
    const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, mockUser2.publicKey);
    
    expect(decrypted).toBe(largeMessage);
    expect(decrypted.length).toBe(largeMessage.length);
  });

	it('should generate and verify a digital signature successfully', async () => {
    const { publicKey, privateKey } = await Dilithium.generateKeyPair();
    const message = new TextEncoder().encode('This is a message to be signed.');

    const signature = await Dilithium.sign(message, privateKey);
    const isValid = await Dilithium.verify(message, signature, publicKey);

    expect(isValid).toBe(true);
  });
  
  it('should detect tampered messages with digital signatures', async () => {
    const message = 'Original message';
    const tamperedMessage = 'Tampered message';
    
    // Generate signature for original message
    const signature = await Dilithium.signMessage(message);
    
    // Verify with tampered message should fail
    const isValid = await Dilithium.verifySignature(tamperedMessage, signature);
    expect(isValid).toBe(false);
    
    // Verify with original message should pass
    const isValidOriginal = await Dilithium.verifySignature(message, signature);
    expect(isValidOriginal).toBe(true);
  });

	it('should derive a key using HKDF', async () => {
    const ikm = new TextEncoder().encode('initial keying material');
    const salt = new TextEncoder().encode('salty');
    const info = 'test info';
    const length = 32;

    const key = await HKDF.derive(ikm, salt, info, length);

    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(length);
    
    // Test that same inputs produce same output
    const key2 = await HKDF.derive(ikm, salt, info, length);
    expect(key).toEqual(key2);
    
    // Test different inputs produce different outputs
    const differentSalt = new TextEncoder().encode('different salt');
    const key3 = await HKDF.derive(ikm, differentSalt, info, length);
    expect(key).not.toEqual(key3);
    
    // Test with empty salt and info
    const emptySalt = new Uint8Array(0);
    const emptyInfo = '';
    const key4 = await HKDF.derive(ikm, emptySalt, emptyInfo, length);
    expect(key4).toBeInstanceOf(Uint8Array);
    expect(key4.length).toBe(length);
  });
  
  it('should handle edge cases in encryption/decryption', async () => {
    // Test with empty message
    const emptyMessage = '';
    const encryptedEmpty = await postQuantumEncryption.encryptForRecipient(emptyMessage, mockUser2.publicKey);
    const decryptedEmpty = await postQuantumEncryption.decryptFromSender(encryptedEmpty, mockUser2.publicKey);
    expect(decryptedEmpty).toBe(emptyMessage);
    
    // Test with very short message
    const shortMessage = 'a';
    const encryptedShort = await postQuantumEncryption.encryptForRecipient(shortMessage, mockUser2.publicKey);
    const decryptedShort = await postQuantumEncryption.decryptFromSender(encryptedShort, mockUser2.publicKey);
    expect(decryptedShort).toBe(shortMessage);
    
    // Test with special characters
    const specialMessage = '!@#$%^&*()_+{}|:"<>?\/.,;\'[]\\=-`~';
    const encryptedSpecial = await postQuantumEncryption.encryptForRecipient(specialMessage, mockUser2.publicKey);
    const decryptedSpecial = await postQuantumEncryption.decryptFromSender(encryptedSpecial, mockUser2.publicKey);
    expect(decryptedSpecial).toBe(specialMessage);
  });
});
