/**
 * Quick test to verify public key validation fixes
 */

import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';
import { Base64 } from '../src/lib/crypto/index.js';

async function testKeyValidation() {
    console.log('🧪 Testing public key validation fixes...');
    
    await postQuantumEncryption.initialize();
    
    // Test 1: 1550 byte key (18 bytes short of 1568) - this was failing before
    console.log('\n📏 Test 1: Testing 1550-byte key (was failing)');
    const shortKey = new Uint8Array(1550);
    shortKey.fill(42); // Fill with non-zero data
    
    const isValid1 = postQuantumEncryption.isValidPublicKey(shortKey);
    console.log(`Result: ${isValid1 ? '✅ PASS' : '❌ FAIL'} - 1550-byte key validation`);
    
    // Test 2: Key with KYBER header
    console.log('\n🔤 Test 2: Testing key with KYBER header');
    const keyWithHeader = new Uint8Array(1586); // 1568 + 18 header
    
    // Set KYBER header
    keyWithHeader[0] = 75; // K
    keyWithHeader[1] = 89; // Y
    keyWithHeader[2] = 66; // B
    keyWithHeader[3] = 69; // E
    keyWithHeader[4] = 82; // R
    keyWithHeader[5] = 49; // 1
    keyWithHeader[6] = 48; // 0
    keyWithHeader[7] = 50; // 2
    
    // Add padding/separator bytes
    for (let i = 8; i < 18; i++) {
        keyWithHeader[i] = 0;
    }
    
    // Fill with key data
    for (let i = 18; i < keyWithHeader.length; i++) {
        keyWithHeader[i] = 42;
    }
    
    const strippedKey = postQuantumEncryption.stripKeyHeaderIfPresent(keyWithHeader);
    console.log(`Original length: ${keyWithHeader.length} bytes`);
    console.log(`Stripped length: ${strippedKey.length} bytes`);
    console.log(`Result: ${strippedKey.length === 1568 ? '✅ PASS' : '❌ FAIL'} - Header stripping`);
    
    // Test 3: Base64 public key validation
    console.log('\n🔤 Test 3: Testing Base64 public key validation');
    const shortKeyBytes = new Uint8Array(1550);
    shortKeyBytes.fill(42);
    const shortKeyBase64 = Base64.encode(shortKeyBytes);
    
    const validationResult = postQuantumEncryption.validatePublicKeyFormat(shortKeyBase64);
    console.log(`Result: ${validationResult !== null ? '✅ PASS' : '❌ FAIL'} - Base64 key validation (1550 bytes)`);
    
    // Test 4: Algorithm info
    console.log('\n📊 Test 4: Algorithm info');
    const algorithmInfo = postQuantumEncryption.getAlgorithmInfo();
    console.log('Algorithm info:', algorithmInfo.primaryAlgorithm.name);
    console.log('Multi-algorithm support:', algorithmInfo.multiAlgorithmSupport);
    
    console.log('\n🏁 Key validation tests completed!');
}

testKeyValidation().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});