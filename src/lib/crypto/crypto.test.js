/**
 * @fileoverview Tests for QryptChat Post-Quantum Cryptography
 * Using Vitest for testing the crypto implementations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
	CRYPTO_CONFIG, 
	Base64, 
	SecureRandom, 
	HKDF, 
	ChaCha20Poly1305,
	CryptoUtils 
} from './index.js';
import { Kyber, KyberKeyManager } from './kyber.js';
import { Dilithium, DilithiumKeyManager } from './dilithium.js';
import { X3DHProtocol, DoubleRatchetProtocol, QryptChatEncryption } from './protocol.js';

describe('Crypto Utilities', () => {
	describe('Base64', () => {
		it('should encode and decode correctly', () => {
			const original = new Uint8Array([1, 2, 3, 4, 5]);
			const encoded = Base64.encode(original);
			const decoded = Base64.decode(encoded);
			
			expect(decoded).toEqual(original);
		});
	});

	describe('SecureRandom', () => {
		it('should generate random bytes of correct length', () => {
			const bytes = SecureRandom.getRandomBytes(32);
			expect(bytes.length).toBe(32);
		});

		it('should generate different random values', () => {
			const bytes1 = SecureRandom.getRandomBytes(16);
			const bytes2 = SecureRandom.getRandomBytes(16);
			expect(bytes1).not.toEqual(bytes2);
		});
	});

	describe('HKDF', () => {
		it('should derive consistent keys from same input', async () => {
			const ikm = SecureRandom.getRandomBytes(32);
			const salt = SecureRandom.getRandomBytes(16);
			const info = 'test-context';
			
			const key1 = await HKDF.derive(ikm, salt, info, 32);
			const key2 = await HKDF.derive(ikm, salt, info, 32);
			
			expect(key1).toEqual(key2);
		});

		it('should derive different keys for different contexts', async () => {
			const ikm = SecureRandom.getRandomBytes(32);
			const salt = SecureRandom.getRandomBytes(16);
			
			const key1 = await HKDF.derive(ikm, salt, 'context1', 32);
			const key2 = await HKDF.derive(ikm, salt, 'context2', 32);
			
			expect(key1).not.toEqual(key2);
		});
	});

	describe('ChaCha20Poly1305', () => {
		it('should encrypt and decrypt correctly', async () => {
			const key = SecureRandom.getRandomBytes(32);
			const nonce = SecureRandom.getRandomBytes(12);
			const plaintext = new TextEncoder().encode('Hello, QryptChat!');
			
			const ciphertext = await ChaCha20Poly1305.encrypt(key, nonce, plaintext);
			const decrypted = await ChaCha20Poly1305.decrypt(key, nonce, ciphertext);
			
			expect(decrypted).toEqual(plaintext);
		});

		it('should fail with wrong key', async () => {
			const key1 = SecureRandom.getRandomBytes(32);
			const key2 = SecureRandom.getRandomBytes(32);
			const nonce = SecureRandom.getRandomBytes(12);
			const plaintext = new TextEncoder().encode('Hello, QryptChat!');
			
			const ciphertext = await ChaCha20Poly1305.encrypt(key1, nonce, plaintext);
			
			await expect(
				ChaCha20Poly1305.decrypt(key2, nonce, ciphertext)
			).rejects.toThrow();
		});
	});
});

describe('CRYSTALS-Kyber', () => {
	describe('Key Generation', () => {
		it('should generate key pair with correct sizes', async () => {
			const keyPair = await Kyber.generateKeyPair();
			
			expect(keyPair.publicKey.length).toBe(CRYPTO_CONFIG.KYBER.PUBLIC_KEY_SIZE);
			expect(keyPair.privateKey.length).toBe(CRYPTO_CONFIG.KYBER.PRIVATE_KEY_SIZE);
		});

		it('should generate different key pairs', async () => {
			const keyPair1 = await Kyber.generateKeyPair();
			const keyPair2 = await Kyber.generateKeyPair();
			
			expect(keyPair1.publicKey).not.toEqual(keyPair2.publicKey);
			expect(keyPair1.privateKey).not.toEqual(keyPair2.privateKey);
		});
	});

	describe('Key Encapsulation', () => {
		it('should encapsulate and decapsulate correctly', async () => {
			const keyPair = await Kyber.generateKeyPair();
			
			const { ciphertext, sharedSecret: secret1 } = await Kyber.encapsulate(keyPair.publicKey);
			const secret2 = await Kyber.decapsulate(ciphertext, keyPair.privateKey);
			
			expect(secret1).toEqual(secret2);
		});

		it('should generate different shared secrets for different key pairs', async () => {
			const keyPair1 = await Kyber.generateKeyPair();
			const keyPair2 = await Kyber.generateKeyPair();
			
			const { sharedSecret: secret1 } = await Kyber.encapsulate(keyPair1.publicKey);
			const { sharedSecret: secret2 } = await Kyber.encapsulate(keyPair2.publicKey);
			
			expect(secret1).not.toEqual(secret2);
		});
	});

	describe('Serialization', () => {
		it('should serialize and deserialize key pairs', async () => {
			const keyPair = await Kyber.generateKeyPair();
			const serialized = Kyber.serializeKeyPair(keyPair);
			const deserialized = Kyber.deserializeKeyPair(serialized);
			
			expect(deserialized.publicKey).toEqual(keyPair.publicKey);
			expect(deserialized.privateKey).toEqual(keyPair.privateKey);
		});
	});
});

describe('CRYSTALS-Dilithium', () => {
	describe('Key Generation', () => {
		it('should generate key pair with correct sizes', async () => {
			const keyPair = await Dilithium.generateKeyPair();
			
			expect(keyPair.publicKey.length).toBe(CRYPTO_CONFIG.DILITHIUM.PUBLIC_KEY_SIZE);
			expect(keyPair.privateKey.length).toBe(CRYPTO_CONFIG.DILITHIUM.PRIVATE_KEY_SIZE);
		});
	});

	describe('Digital Signatures', () => {
		it('should sign and verify correctly', async () => {
			const keyPair = await Dilithium.generateKeyPair();
			const message = new TextEncoder().encode('Test message for signing');
			
			const signature = await Dilithium.sign(message, keyPair.privateKey);
			const isValid = await Dilithium.verify(message, signature, keyPair.publicKey);
			
			expect(isValid).toBe(true);
		});

		it('should fail verification with wrong public key', async () => {
			const keyPair1 = await Dilithium.generateKeyPair();
			const keyPair2 = await Dilithium.generateKeyPair();
			const message = new TextEncoder().encode('Test message for signing');
			
			const signature = await Dilithium.sign(message, keyPair1.privateKey);
			const isValid = await Dilithium.verify(message, signature, keyPair2.publicKey);
			
			expect(isValid).toBe(false);
		});

		it('should fail verification with modified message', async () => {
			const keyPair = await Dilithium.generateKeyPair();
			const message1 = new TextEncoder().encode('Original message');
			const message2 = new TextEncoder().encode('Modified message');
			
			const signature = await Dilithium.sign(message1, keyPair.privateKey);
			const isValid = await Dilithium.verify(message2, signature, keyPair.publicKey);
			
			expect(isValid).toBe(false);
		});
	});
});

describe('Key Management', () => {
	describe('KyberKeyManager', () => {
		it('should generate one-time pre-keys', async () => {
			const keys = await KyberKeyManager.generateOneTimePreKeys(5);
			
			expect(keys).toHaveLength(5);
			keys.forEach(key => {
				expect(key).toHaveProperty('keyId');
				expect(key).toHaveProperty('publicKey');
				expect(key).toHaveProperty('privateKey');
			});
		});

		it('should generate signed pre-key', async () => {
			const signedPreKey = await KyberKeyManager.generateSignedPreKey();
			
			expect(signedPreKey).toHaveProperty('keyId');
			expect(signedPreKey).toHaveProperty('publicKey');
			expect(signedPreKey).toHaveProperty('privateKey');
		});
	});

	describe('DilithiumKeyManager', () => {
		it('should generate identity key', async () => {
			const userId = 'test-user-123';
			const identityKey = await DilithiumKeyManager.generateIdentityKey(userId);
			
			expect(identityKey).toHaveProperty('keyId');
			expect(identityKey).toHaveProperty('publicKey');
			expect(identityKey).toHaveProperty('privateKey');
			expect(identityKey.userId).toBe(userId);
		});

		it('should sign and verify pre-keys', async () => {
			const identityKeyPair = await Dilithium.generateKeyPair();
			const kyberKeyPair = await Kyber.generateKeyPair();
			const kyberPublicKeyB64 = Base64.encode(kyberKeyPair.publicKey);
			
			const signature = await DilithiumKeyManager.signPreKey(
				kyberPublicKeyB64,
				identityKeyPair.privateKey
			);
			
			const isValid = await DilithiumKeyManager.verifySignedPreKey(
				kyberPublicKeyB64,
				signature,
				identityKeyPair.publicKey
			);
			
			expect(isValid).toBe(true);
		});
	});
});

describe('Encryption Protocol', () => {
	let aliceKeys, bobKeys, bobKeyBundle;

	beforeEach(async () => {
		// Generate Alice's keys
		const aliceIdentity = await Dilithium.generateKeyPair();
		const aliceSignedPreKey = await Kyber.generateKeyPair();
		
		aliceKeys = {
			identityPublicKey: aliceIdentity.publicKey,
			identityPrivateKey: aliceIdentity.privateKey,
			signedPreKeyPrivate: aliceSignedPreKey.privateKey
		};

		// Generate Bob's keys and key bundle
		const bobIdentity = await Dilithium.generateKeyPair();
		const bobSignedPreKey = await Kyber.generateKeyPair();
		const bobOneTimeKeys = await KyberKeyManager.generateOneTimePreKeys(3);
		
		bobKeys = {
			identityPrivateKey: bobIdentity.privateKey,
			signedPreKeyPrivate: bobSignedPreKey.privateKey,
			oneTimePreKeys: bobOneTimeKeys
		};

		// Create Bob's key bundle
		bobKeyBundle = {
			identityKey: {
				keyId: 'bob-identity',
				publicKey: Base64.encode(bobIdentity.publicKey)
			},
			signedPreKey: {
				keyId: 'bob-signed-prekey',
				publicKey: Base64.encode(bobSignedPreKey.publicKey),
				signature: await DilithiumKeyManager.signPreKey(
					Base64.encode(bobSignedPreKey.publicKey),
					bobIdentity.privateKey
				)
			},
			oneTimePreKeys: bobOneTimeKeys.map(key => ({
				keyId: key.keyId,
				publicKey: key.publicKey
			}))
		};
	});

	describe('X3DH Protocol', () => {
		it('should perform key agreement successfully', async () => {
			const keyAgreement = await X3DHProtocol.initiateKeyAgreement(
				bobKeyBundle,
				aliceKeys.identityPrivateKey
			);
			
			expect(keyAgreement).toHaveProperty('sharedSecret');
			expect(keyAgreement).toHaveProperty('ephemeralPublicKey');
			expect(keyAgreement).toHaveProperty('usedOneTimeKeyId');
		});

		it('should derive same shared secret on both sides', async () => {
			const keyAgreement = await X3DHProtocol.initiateKeyAgreement(
				bobKeyBundle,
				aliceKeys.identityPrivateKey
			);
			
			const bobSharedSecret = await X3DHProtocol.completeKeyAgreement(
				keyAgreement.ephemeralPublicKey,
				keyAgreement.usedOneTimeKeyId,
				keyAgreement.salt,
				bobKeys
			);
			
			expect(bobSharedSecret).toEqual(keyAgreement.sharedSecret);
		});
	});

	describe('Double Ratchet Protocol', () => {
		it('should initialize session correctly', async () => {
			const sharedSecret = SecureRandom.getRandomBytes(32);
			const session = await DoubleRatchetProtocol.initializeSession(sharedSecret, true);
			
			expect(session).toHaveProperty('rootKey');
			expect(session).toHaveProperty('sendingChain');
			expect(session).toHaveProperty('sessionId');
		});

		it('should encrypt and decrypt messages', async () => {
			const sharedSecret = SecureRandom.getRandomBytes(32);
			const aliceSession = await DoubleRatchetProtocol.initializeSession(sharedSecret, true);
			
			const message = 'Hello from Alice!';
			const plaintext = new TextEncoder().encode(message);
			
			const { ciphertext, header, newState } = await DoubleRatchetProtocol.encryptMessage(
				aliceSession,
				plaintext
			);
			
			expect(ciphertext).toBeDefined();
			expect(header).toHaveProperty('messageNumber');
			expect(newState.sendingChain.messageNumber).toBe(1);
		});
	});

	describe('QryptChatEncryption', () => {
		it('should initialize conversation', async () => {
			const result = await QryptChatEncryption.initializeConversation(
				'alice-123',
				bobKeyBundle,
				aliceKeys
			);
			
			expect(result).toHaveProperty('conversationKey');
			expect(result).toHaveProperty('initialMessage');
			expect(result.initialMessage.type).toBe('key_exchange');
		});

		it('should encrypt and decrypt messages end-to-end', async () => {
			// Initialize conversation
			const { conversationKey, conversationData } = await QryptChatEncryption.initializeConversation(
				'alice-123',
				bobKeyBundle,
				aliceKeys
			);
			
			// Encrypt message
			const messageText = 'Hello, this is a quantum-resistant message!';
			const { encryptedMessage, newRatchetState } = await QryptChatEncryption.encryptMessage(
				conversationKey,
				messageText,
				conversationData.ratchetState
			);
			
			expect(encryptedMessage).toHaveProperty('encryptedContent');
			expect(encryptedMessage).toHaveProperty('header');
			
			// Decrypt message
			const { plaintext } = await QryptChatEncryption.decryptMessage(
				encryptedMessage,
				newRatchetState
			);
			
			expect(plaintext).toBe(messageText);
		});
	});
});

describe('CryptoUtils', () => {
	it('should perform constant time comparison', () => {
		const a = new Uint8Array([1, 2, 3, 4]);
		const b = new Uint8Array([1, 2, 3, 4]);
		const c = new Uint8Array([1, 2, 3, 5]);
		
		expect(CryptoUtils.constantTimeEqual(a, b)).toBe(true);
		expect(CryptoUtils.constantTimeEqual(a, c)).toBe(false);
	});

	it('should concatenate arrays correctly', () => {
		const a = new Uint8Array([1, 2]);
		const b = new Uint8Array([3, 4]);
		const c = new Uint8Array([5, 6]);
		
		const result = CryptoUtils.concatenate(a, b, c);
		const expected = new Uint8Array([1, 2, 3, 4, 5, 6]);
		
		expect(result).toEqual(expected);
	});

	it('should generate unique key IDs', () => {
		const id1 = CryptoUtils.generateKeyId();
		const id2 = CryptoUtils.generateKeyId();
		
		expect(id1).not.toBe(id2);
		expect(id1.length).toBeGreaterThan(0);
		expect(id2.length).toBeGreaterThan(0);
	});

	it('should hash data consistently', async () => {
		const data = new TextEncoder().encode('test data');
		const hash1 = await CryptoUtils.hash(data);
		const hash2 = await CryptoUtils.hash(data);
		
		expect(hash1).toEqual(hash2);
		expect(hash1.length).toBe(32); // SHA-256 produces 32-byte hashes
	});
});