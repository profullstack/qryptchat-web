/**
 * Debug the actual encryption flow with real key data
 */

import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';
import { Base64 } from '../src/lib/crypto/index.js';

async function debugEncryptionFlow() {
    console.log('🔍 Debugging encryption flow with real key data...');
    
    await postQuantumEncryption.initialize();
    
    // Simulate the actual problematic key from console logs
    // Base64 key that starts with "S1lCRVIxMDI08kcVwEbA" and is 2092 chars long
    const problematicKeyBase64 = 'S1lCRVIxMDI08kcVwEbAA'.repeat(100); // Simulate long key
    
    console.log(`Original Base64 key length: ${problematicKeyBase64.length} chars`);
    
    try {
        // Decode it 
        const keyBytes = Base64.decode(problematicKeyBase64);
        console.log(`Decoded key length: ${keyBytes.length} bytes`);
        
        // Check if it has header
        if (keyBytes.length > 8 &&
            keyBytes[0] === 75 && keyBytes[1] === 89 &&
            keyBytes[2] === 66 && keyBytes[3] === 69 &&
            keyBytes[4] === 82) {
            console.log('✅ KYBER header detected');
        } else {
            console.log('❌ No KYBER header detected');
            console.log('First 8 bytes:', Array.from(keyBytes.slice(0, 8)));
        }
        
        // Test strip header function
        const strippedKey = postQuantumEncryption.stripKeyHeaderIfPresent(keyBytes);
        console.log(`After stripping: ${strippedKey.length} bytes`);
        
        // Test validation
        const isValid = postQuantumEncryption.isValidPublicKey(strippedKey);
        console.log(`Key validation result: ${isValid}`);
        
    } catch (error) {
        console.error('❌ Error in test:', error);
    }
    
    console.log('\n🔍 Now testing with the exact key from logs...');
    
    // Create a key that exactly matches what we see in the logs
    const testKey = new Uint8Array(2092); // Start with the full size from logs
    
    // Set KYBER header
    testKey[0] = 75; // K
    testKey[1] = 89; // Y  
    testKey[2] = 66; // B
    testKey[3] = 69; // E
    testKey[4] = 82; // R
    testKey[5] = 49; // 1
    testKey[6] = 48; // 0
    testKey[7] = 50; // 2
    
    // Add separator/padding
    for (let i = 8; i < 18; i++) {
        testKey[i] = 0;
    }
    
    // Fill rest with key data  
    for (let i = 18; i < testKey.length; i++) {
        testKey[i] = Math.floor(Math.random() * 256);
    }
    
    console.log(`Test key original length: ${testKey.length} bytes`);
    
    // Test the stripping
    const strippedTestKey = postQuantumEncryption.stripKeyHeaderIfPresent(testKey);
    console.log(`Test key after stripping: ${strippedTestKey.length} bytes`);
    
    // Test validation
    const testIsValid = postQuantumEncryption.isValidPublicKey(strippedTestKey);
    console.log(`Test key validation: ${testIsValid}`);
}

debugEncryptionFlow().catch(console.error);