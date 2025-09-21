/**
 * Test that new message encryption works with fresh keys
 */

import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

async function testNewMessageEncryption() {
    console.log('🧪 Testing new message encryption with fresh keys...');
    
    await postQuantumEncryption.initialize();
    
    // Generate fresh user keys to test with
    const userKeys = await postQuantumEncryption.generateUserKeys();
    console.log(`✅ Generated fresh ML-KEM-1024 keys`);
    console.log(`Public key length: ${userKeys.publicKey.length} chars (Base64)`);
    
    try {
        // Test encryption with our own fresh public key
        const testMessage = 'Hello, this is a test message!';
        const encrypted = await postQuantumEncryption.encryptForRecipient(testMessage, userKeys.publicKey);
        
        console.log('✅ Encryption successful with fresh keys!');
        console.log(`Encrypted message length: ${encrypted.length} chars`);
        
        // Test decryption
        const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, userKeys.publicKey);
        console.log(`✅ Decryption result: "${decrypted}"`);
        
        if (decrypted === testMessage) {
            console.log('🎉 SUCCESS: Full encryption/decryption cycle works with fresh keys!');
        } else {
            console.log('❌ FAIL: Decrypted message doesn\'t match original');
        }
        
    } catch (error) {
        console.error('❌ Encryption failed with fresh keys:', error);
    }
}

testNewMessageEncryption().catch(console.error);