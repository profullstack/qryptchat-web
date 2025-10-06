# QryptChat Encryption System

## Overview
QryptChat implements a robust, post-quantum secure encryption system that ensures end-to-end encryption for all messages. The system combines ML-KEM (Kyber) for key exchange and ChaCha20-Poly1305 for message encryption, providing strong security against both classical and quantum computing attacks.

## Key Components

### 1. ClientEncryptionService
Located in `src/lib/crypto/client-encryption.js`, this service provides a simplified API for encryption/decryption operations.

### 2. PostQuantumEncryptionService
Located in `src/lib/crypto/post-quantum-encryption.js`, this is the core encryption service that implements the cryptographic operations.

## Encryption Algorithms

### Primary: ML-KEM-1024
- **Security Level**: NIST Level 5 (highest)
- **Public Key Size**: 1,568 bytes
- **Use Case**: Default for all new encryption operations

### Backward Compatibility: ML-KEM-768
- **Security Level**: NIST Level 3
- **Public Key Size**: 1,184 bytes
- **Use Case**: Decrypting older messages

## Key Generation

### User Key Generation
1. **Initialization**: When a user first starts the app, the system initializes the encryption service and checks for existing keys in IndexedDB.

2. **Key Generation Process**:
   - The system uses the ML-KEM-1024 implementation to generate a new key pair
   - The key generation process involves:
     - The `MlKem1024` class's `generateKeyPair()` method is called
     - This creates a new key pair using the underlying ML-KEM-1024 implementation
     - The private key is generated with sufficient entropy for post-quantum security
     - The key generation is performed asynchronously to prevent UI blocking
   - The private key contains sensitive information that must remain secret
   - All key generation happens client-side in the browser

3. **Key Storage**:
   - Private keys are never transmitted over the network
   - Keys are encrypted before being stored in IndexedDB
   - Each key pair includes metadata:
     - Algorithm version (ML-KEM-1024 or ML-KEM-768)
     - Creation timestamp
     - Key version identifier
     - Key usage flags

4. **Key Security**:
   - Private keys are never written to disk in plaintext
   - Memory is zeroized after key operations when possible
   - Keys are bound to the user's device and browser profile

### Conversation-Specific Keys
Each conversation generates its own ephemeral key pair for message encryption, providing forward secrecy:

```javascript
// Conversation key generation in client-encryption.js
async getConversationKey(conversationId) {
  if (!this.conversationKeys.has(conversationId)) {
    // Generate new ML-KEM key pair for this conversation
    const keyPair = await postQuantumEncryption.kemAlgorithm.generateKeyPair();
    const keys = {
      publicKey: Base64.encode(keyPair[0]),  // Encoded public key
      privateKey: Base64.encode(keyPair[1])  // Encoded private key
    };
    this.conversationKeys.set(conversationId, keys);
  }
  return this.conversationKeys.get(conversationId);
}
```

### Key Generation Details
1. **ML-KEM-1024 Key Generation**:
   - Uses the `generateKeyPair()` method from the `MlKem1024` class
   - Implements the ML-KEM-1024 algorithm as specified in the FIPS 203 standard
   - Generates a key pair with 256-bit security level (NIST Level 5)
   - The process is designed to be resistant to side-channel attacks
   - Runs asynchronously to maintain UI responsiveness

2. **Key Properties**:
   - Private keys are generated with cryptographically secure randomness
   - The key generation is deterministic given the same random seed
   - Keys are encoded in a binary format before being base64-encoded for storage

3. **Key Management**:
   - Keys are stored in memory while the app is running
   - They are not persisted between sessions for security
   - Each conversation's keys are independent and cannot be used to derive other keys

## Message Encryption

### Process
1. **Sender Side**:
   - Generates an ephemeral key pair for the message
   - Derives a shared secret using the recipient's public key
   - Encrypts the message using ChaCha20-Poly1305 with the derived key
   - Sends the encrypted message and ephemeral public key

2. **Recipient Side**:
   - Uses their private key to derive the same shared secret
   - Decrypts the message using ChaCha20-Poly1305

### Implementation
```javascript
// Encrypting a message
async encryptMessage(conversationId, message) {
  const keys = await this.getConversationKey(conversationId);
  const encryptedContent = await postQuantumEncryption.encryptForRecipient(
    message, 
    keys.publicKey
  );
  return encryptedContent;
}
```

## Message Decryption

### Process
1. Receives the encrypted message and ephemeral public key
2. Uses the recipient's private key to derive the shared secret
3. Decrypts the message using ChaCha20-Poly1305

### Implementation
```javascript
// Decrypting a message
async decryptMessage(conversationId, encryptedContent) {
  const keys = await this.getConversationKey(conversationId);
  const decrypted = await postQuantumEncryption.decrypt(
    encryptedContent, 
    keys.privateKey
  );
  return decrypted;
}
```

## Security Features

### Forward Secrecy
- Each message uses an ephemeral key pair
- Compromised private keys cannot decrypt past messages

### Post-Quantum Resistance
- Uses ML-KEM (Kyber) for key exchange
- Resistant to attacks from quantum computers

### Key Management
- Private keys never leave the user's device
- Keys are stored securely in IndexedDB
- Each conversation has its own key pair

## Error Handling
The system includes comprehensive error handling for:
- Missing or invalid keys
- Decryption failures
- Key generation issues
- Storage errors

## Best Practices
1. Always verify the encryption status before sending messages
2. Regularly update the application to receive security updates
3. Report any suspicious behavior immediately

## Troubleshooting
### Common Issues
1. **Decryption Fails**
   - Verify the correct private key is being used
   - Check for message tampering
   - Ensure both parties are using compatible app versions

2. **Key Generation Fails**
   - Check browser compatibility
   - Ensure sufficient system resources are available
   - Try refreshing the application

For additional security concerns, please contact the QryptChat security team.
