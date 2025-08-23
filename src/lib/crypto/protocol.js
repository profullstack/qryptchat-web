/**
 * @fileoverview QryptChat End-to-End Encryption Protocol
 * Implements the complete encryption protocol using CRYSTALS-Kyber, CRYSTALS-Dilithium,
 * and ChaCha20-Poly1305 for quantum-resistant messaging
 */

import { Kyber, KyberKeyManager } from './kyber.js';
import { Dilithium, DilithiumKeyManager } from './dilithium.js';
import { 
	ChaCha20Poly1305, 
	HKDF, 
	SecureRandom, 
	Base64, 
	CryptoUtils,
	EncryptionError,
	DecryptionError 
} from './index.js';

/**
 * X3DH-style key agreement protocol adapted for post-quantum cryptography
 */
export class X3DHProtocol {
	/**
	 * Perform initial key agreement (sender side)
	 * @param {object} recipientKeyBundle - Recipient's key bundle
	 * @param {Uint8Array} senderIdentityPrivateKey - Sender's identity private key
	 * @returns {Promise<{sharedSecret: Uint8Array, ephemeralPublicKey: string, usedOneTimeKeyId: string}>}
	 */
	static async initiateKeyAgreement(recipientKeyBundle, senderIdentityPrivateKey) {
		try {
			// Verify the recipient's key bundle
			const isValid = await DilithiumKeyManager.verifyKeyBundle(recipientKeyBundle);
			if (!isValid) {
				throw new EncryptionError('Invalid recipient key bundle');
			}

			// Generate ephemeral key pair
			const ephemeralKeyPair = await Kyber.generateKeyPair();

			// Get recipient's keys
			const recipientIdentityPublicKey = Base64.decode(recipientKeyBundle.identityKey.publicKey);
			const recipientSignedPreKey = Base64.decode(recipientKeyBundle.signedPreKey.publicKey);
			
			// Select and use one-time pre-key (if available)
			let recipientOneTimePreKey = null;
			let usedOneTimeKeyId = null;
			
			if (recipientKeyBundle.oneTimePreKeys && recipientKeyBundle.oneTimePreKeys.length > 0) {
				const selectedKey = recipientKeyBundle.oneTimePreKeys[0];
				recipientOneTimePreKey = Base64.decode(selectedKey.publicKey);
				usedOneTimeKeyId = selectedKey.keyId;
			}

			// Perform 4 key exchanges (X3DH adapted for PQC)
			const dh1 = await Kyber.encapsulate(recipientSignedPreKey);
			const dh2 = await Kyber.encapsulate(recipientIdentityPublicKey);
			const dh3 = await Kyber.encapsulate(recipientSignedPreKey);
			
			let dh4 = null;
			if (recipientOneTimePreKey) {
				dh4 = await Kyber.encapsulate(recipientOneTimePreKey);
			}

			// Combine shared secrets
			const sharedSecrets = [dh1.sharedSecret, dh2.sharedSecret, dh3.sharedSecret];
			if (dh4) {
				sharedSecrets.push(dh4.sharedSecret);
			}

			const combinedSecret = CryptoUtils.concatenate(...sharedSecrets);
			const salt = SecureRandom.generateSalt();
			
			// Derive master secret
			const sharedSecret = await HKDF.derive(
				combinedSecret,
				salt,
				'X3DH-MasterSecret',
				32
			);

			// Clear sensitive data
			sharedSecrets.forEach(secret => CryptoUtils.secureClear(secret));
			CryptoUtils.secureClear(combinedSecret);

			return {
				sharedSecret,
				ephemeralPublicKey: Base64.encode(ephemeralKeyPair.publicKey),
				usedOneTimeKeyId,
				salt: Base64.encode(salt)
			};

		} catch (error) {
			throw new EncryptionError(`Key agreement initiation failed: ${error.message}`);
		}
	}

	/**
	 * Complete key agreement (recipient side)
	 * @param {string} ephemeralPublicKey - Sender's ephemeral public key
	 * @param {string} usedOneTimeKeyId - ID of the used one-time pre-key
	 * @param {string} salt - Salt used for key derivation
	 * @param {object} recipientKeys - Recipient's private keys
	 * @returns {Promise<Uint8Array>} - Shared secret
	 */
	static async completeKeyAgreement(ephemeralPublicKey, usedOneTimeKeyId, salt, recipientKeys) {
		try {
			const ephemeralPubKey = Base64.decode(ephemeralPublicKey);
			const saltBytes = Base64.decode(salt);

			// Perform corresponding key exchanges
			const dh1 = await Kyber.decapsulate(ephemeralPubKey, recipientKeys.signedPreKeyPrivate);
			const dh2 = await Kyber.decapsulate(ephemeralPubKey, recipientKeys.identityPrivateKey);
			const dh3 = await Kyber.decapsulate(ephemeralPubKey, recipientKeys.signedPreKeyPrivate);

			const sharedSecrets = [dh1, dh2, dh3];

			// Use one-time pre-key if it was used
			if (usedOneTimeKeyId && recipientKeys.oneTimePreKeys) {
				const oneTimeKey = recipientKeys.oneTimePreKeys.find(k => k.keyId === usedOneTimeKeyId);
				if (oneTimeKey) {
					const dh4 = await Kyber.decapsulate(ephemeralPubKey, Base64.decode(oneTimeKey.privateKey));
					sharedSecrets.push(dh4);
				}
			}

			// Combine and derive shared secret
			const combinedSecret = CryptoUtils.concatenate(...sharedSecrets);
			const sharedSecret = await HKDF.derive(
				combinedSecret,
				saltBytes,
				'X3DH-MasterSecret',
				32
			);

			// Clear sensitive data
			sharedSecrets.forEach(secret => CryptoUtils.secureClear(secret));
			CryptoUtils.secureClear(combinedSecret);

			return sharedSecret;

		} catch (error) {
			throw new DecryptionError(`Key agreement completion failed: ${error.message}`);
		}
	}
}

/**
 * Double Ratchet protocol adapted for post-quantum cryptography
 */
export class DoubleRatchetProtocol {
	/**
	 * Initialize a new ratchet session
	 * @param {Uint8Array} sharedSecret - Initial shared secret from X3DH
	 * @param {boolean} isSender - Whether this is the sending side
	 * @returns {Promise<object>} - Ratchet state
	 */
	static async initializeSession(sharedSecret, isSender = true) {
		const salt = SecureRandom.generateSalt();
		const { rootKey, chainKey } = await HKDF.deriveRootAndChainKeys(
			sharedSecret,
			salt,
			'DoubleRatchet-Init'
		);

		let sendingChain = null;
		let receivingChain = null;
		let keyPair = null;

		if (isSender) {
			keyPair = await Kyber.generateKeyPair();
			sendingChain = {
				chainKey,
				messageNumber: 0
			};
		} else {
			receivingChain = {
				chainKey,
				messageNumber: 0
			};
		}

		return {
			rootKey,
			sendingChain,
			receivingChain,
			keyPair,
			remotePublicKey: null,
			skippedMessages: new Map(),
			sessionId: CryptoUtils.generateKeyId()
		};
	}

	/**
	 * Encrypt a message using the double ratchet
	 * @param {object} ratchetState - Current ratchet state
	 * @param {Uint8Array} plaintext - Message to encrypt
	 * @param {Uint8Array} associatedData - Additional authenticated data
	 * @returns {Promise<{ciphertext: Uint8Array, header: object, newState: object}>}
	 */
	static async encryptMessage(ratchetState, plaintext, associatedData = new Uint8Array(0)) {
		try {
			if (!ratchetState.sendingChain) {
				throw new EncryptionError('No sending chain available');
			}

			// Derive message key
			const messageKey = await HKDF.deriveMessageKey(
				ratchetState.sendingChain.chainKey,
				ratchetState.sendingChain.messageNumber
			);

			// Encrypt the message
			const nonce = SecureRandom.generateNonce();
			const ciphertext = await ChaCha20Poly1305.encrypt(
				messageKey,
				nonce,
				plaintext,
				associatedData
			);

			// Create message header
			const header = {
				publicKey: ratchetState.keyPair ? Base64.encode(ratchetState.keyPair.publicKey) : null,
				messageNumber: ratchetState.sendingChain.messageNumber,
				previousChainLength: ratchetState.receivingChain?.messageNumber || 0,
				nonce: Base64.encode(nonce)
			};

			// Update chain key for next message
			const newChainKey = await HKDF.derive(
				ratchetState.sendingChain.chainKey,
				new Uint8Array(0),
				`ChainKey-${ratchetState.sendingChain.messageNumber + 1}`,
				32
			);

			// Update state
			const newState = {
				...ratchetState,
				sendingChain: {
					chainKey: newChainKey,
					messageNumber: ratchetState.sendingChain.messageNumber + 1
				}
			};

			// Clear sensitive data
			CryptoUtils.secureClear(messageKey);

			return { ciphertext, header, newState };

		} catch (error) {
			throw new EncryptionError(`Message encryption failed: ${error.message}`);
		}
	}

	/**
	 * Decrypt a message using the double ratchet
	 * @param {object} ratchetState - Current ratchet state
	 * @param {Uint8Array} ciphertext - Encrypted message
	 * @param {object} header - Message header
	 * @param {Uint8Array} associatedData - Additional authenticated data
	 * @returns {Promise<{plaintext: Uint8Array, newState: object}>}
	 */
	static async decryptMessage(ratchetState, ciphertext, header, associatedData = new Uint8Array(0)) {
		try {
			// Check if we need to perform a DH ratchet step
			let newState = ratchetState;
			
			if (header.publicKey && header.publicKey !== ratchetState.remotePublicKey) {
				newState = await this.performDHRatchet(ratchetState, header.publicKey);
			}

			// Derive message key
			const messageKey = await HKDF.deriveMessageKey(
				newState.receivingChain.chainKey,
				header.messageNumber
			);

			// Decrypt the message
			const nonce = Base64.decode(header.nonce);
			const plaintext = await ChaCha20Poly1305.decrypt(
				messageKey,
				nonce,
				ciphertext,
				associatedData
			);

			// Update receiving chain
			const newChainKey = await HKDF.derive(
				newState.receivingChain.chainKey,
				new Uint8Array(0),
				`ChainKey-${header.messageNumber + 1}`,
				32
			);

			const finalState = {
				...newState,
				receivingChain: {
					chainKey: newChainKey,
					messageNumber: header.messageNumber + 1
				}
			};

			// Clear sensitive data
			CryptoUtils.secureClear(messageKey);

			return { plaintext, newState: finalState };

		} catch (error) {
			throw new DecryptionError(`Message decryption failed: ${error.message}`);
		}
	}

	/**
	 * Perform a DH ratchet step when receiving a new public key
	 * @param {object} ratchetState - Current ratchet state
	 * @param {string} remotePublicKey - New remote public key
	 * @returns {Promise<object>} - Updated ratchet state
	 */
	static async performDHRatchet(ratchetState, remotePublicKey) {
		try {
			const remoteKeyBytes = Base64.decode(remotePublicKey);
			
			// Generate new key pair
			const newKeyPair = await Kyber.generateKeyPair();
			
			// Perform key exchange
			const { sharedSecret } = await Kyber.encapsulate(remoteKeyBytes);
			
			// Derive new root and chain keys
			const salt = SecureRandom.generateSalt();
			const { rootKey: newRootKey, chainKey: newReceivingChainKey } = 
				await HKDF.deriveRootAndChainKeys(sharedSecret, salt, 'DH-Ratchet-Receive');
			
			const { chainKey: newSendingChainKey } = 
				await HKDF.deriveRootAndChainKeys(sharedSecret, salt, 'DH-Ratchet-Send');

			// Clear sensitive data
			CryptoUtils.secureClear(sharedSecret);

			return {
				...ratchetState,
				rootKey: newRootKey,
				keyPair: newKeyPair,
				remotePublicKey,
				sendingChain: {
					chainKey: newSendingChainKey,
					messageNumber: 0
				},
				receivingChain: {
					chainKey: newReceivingChainKey,
					messageNumber: 0
				}
			};

		} catch (error) {
			throw new EncryptionError(`DH ratchet step failed: ${error.message}`);
		}
	}
}

/**
 * High-level encryption service that combines all protocols
 */
export class QryptChatEncryption {
	/**
	 * Initialize encryption for a new conversation
	 * @param {string} userId - Current user ID
	 * @param {object} recipientKeyBundle - Recipient's key bundle
	 * @param {object} userKeys - Current user's private keys
	 * @returns {Promise<{conversationKey: string, initialMessage: object}>}
	 */
	static async initializeConversation(userId, recipientKeyBundle, userKeys) {
		try {
			// Perform X3DH key agreement
			const keyAgreement = await X3DHProtocol.initiateKeyAgreement(
				recipientKeyBundle,
				userKeys.identityPrivateKey
			);

			// Initialize double ratchet
			const ratchetState = await DoubleRatchetProtocol.initializeSession(
				keyAgreement.sharedSecret,
				true
			);

			// Create conversation key
			const conversationKey = CryptoUtils.generateKeyId();

			// Store ratchet state (in production, this would be encrypted and stored securely)
			const conversationData = {
				conversationKey,
				ratchetState,
				participantIds: [userId, recipientKeyBundle.identityKey.keyId],
				createdAt: Date.now()
			};

			// Create initial message with key exchange info
			const initialMessage = {
				type: 'key_exchange',
				ephemeralPublicKey: keyAgreement.ephemeralPublicKey,
				usedOneTimeKeyId: keyAgreement.usedOneTimeKeyId,
				salt: keyAgreement.salt,
				senderIdentityKey: Base64.encode(userKeys.identityPublicKey)
			};

			return { conversationKey, initialMessage, conversationData };

		} catch (error) {
			throw new EncryptionError(`Conversation initialization failed: ${error.message}`);
		}
	}

	/**
	 * Encrypt a message for sending
	 * @param {string} conversationKey - Conversation identifier
	 * @param {string} messageText - Plain text message
	 * @param {object} ratchetState - Current ratchet state
	 * @returns {Promise<{encryptedMessage: object, newRatchetState: object}>}
	 */
	static async encryptMessage(conversationKey, messageText, ratchetState) {
		try {
			const plaintext = new TextEncoder().encode(messageText);
			const associatedData = new TextEncoder().encode(conversationKey);

			const { ciphertext, header, newState } = await DoubleRatchetProtocol.encryptMessage(
				ratchetState,
				plaintext,
				associatedData
			);

			const encryptedMessage = {
				conversationId: conversationKey,
				encryptedContent: Base64.encode(ciphertext),
				header,
				timestamp: Date.now(),
				messageId: CryptoUtils.generateKeyId()
			};

			return { encryptedMessage, newRatchetState: newState };

		} catch (error) {
			throw new EncryptionError(`Message encryption failed: ${error.message}`);
		}
	}

	/**
	 * Decrypt a received message
	 * @param {object} encryptedMessage - Encrypted message object
	 * @param {object} ratchetState - Current ratchet state
	 * @returns {Promise<{plaintext: string, newRatchetState: object}>}
	 */
	static async decryptMessage(encryptedMessage, ratchetState) {
		try {
			const ciphertext = Base64.decode(encryptedMessage.encryptedContent);
			const associatedData = new TextEncoder().encode(encryptedMessage.conversationId);

			const { plaintext, newState } = await DoubleRatchetProtocol.decryptMessage(
				ratchetState,
				ciphertext,
				encryptedMessage.header,
				associatedData
			);

			const messageText = new TextDecoder().decode(plaintext);

			return { plaintext: messageText, newRatchetState: newState };

		} catch (error) {
			throw new DecryptionError(`Message decryption failed: ${error.message}`);
		}
	}
}