/**
 * Test script to verify the fix for encrypted message display issue
 */

import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';

// Mock console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
let logs = [];
let errors = [];

function setupMocks() {
  logs = [];
  errors = [];
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalConsoleLog(...args);
  };
  console.error = (...args) => {
    errors.push(args.join(' '));
    originalConsoleError(...args);
  };
}

function restoreMocks() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}

async function runTests() {
  setupMocks();
  console.log('======= TESTING ENCRYPTION DISPLAY FIX =======');
  
  try {
    await postQuantumEncryption.initialize();
    
    // Test 1: Properly formatted encrypted message (should work)
    console.log('\n\n----- Test 1: Valid Encrypted Message -----');
    const testMessage = "Hello, this is a test message!";
    const keys = await postQuantumEncryption.getUserKeys();
    const encrypted = await postQuantumEncryption.encryptForRecipient(testMessage, keys.publicKey);
    const decrypted = await postQuantumEncryption.decryptFromSender(encrypted, keys.publicKey);
    console.log('Encryption/Decryption Result:', {
      original: testMessage,
      encrypted: encrypted.substring(0, 50) + '...',
      decrypted,
      success: decrypted === testMessage
    });
    
    // Test 2: Invalid JSON format (should show user-friendly message)
    console.log('\n\n----- Test 2: Invalid JSON Format -----');
    const invalidJson = "This is not valid JSON";
    const result2 = await postQuantumEncryption.decryptFromSender(invalidJson, keys.publicKey);
    console.log('Invalid JSON Decryption Result:', {
      input: invalidJson,
      output: result2,
      success: result2 === '[Encrypted message]'
    });
    
    // Test 3: Valid JSON but missing required fields (should show user-friendly message)
    console.log('\n\n----- Test 3: Valid JSON Missing Fields -----');
    const invalidFormat = JSON.stringify({ v: 1, type: "wrong-format" });
    const result3 = await postQuantumEncryption.decryptFromSender(invalidFormat, keys.publicKey);
    console.log('Invalid Format Decryption Result:', {
      input: invalidFormat,
      output: result3,
      success: result3.includes('[Encrypted message')
    });
    
    // Test 4: Valid JSON with wrong algorithm (should show user-friendly message)
    console.log('\n\n----- Test 4: Wrong Algorithm -----');
    const wrongAlgorithm = JSON.stringify({
      v: 3,
      alg: 'WRONG-ALGORITHM',
      kem: 'abc',
      s: 'def',
      n: 'ghi',
      c: 'jkl'
    });
    const result4 = await postQuantumEncryption.decryptFromSender(wrongAlgorithm, keys.publicKey);
    console.log('Wrong Algorithm Decryption Result:', {
      input: wrongAlgorithm,
      output: result4,
      success: result4.includes('[Encrypted message')
    });
    
    // Test 5: ML-KEM-768 vs ML-KEM-1024 algorithm mismatch (common in real app)
    console.log('\n\n----- Test 5: ML-KEM-768 vs ML-KEM-1024 Mismatch -----');
    const mlkemMismatch = JSON.stringify({
      v: 3,
      alg: 'ML-KEM-768',
      kem: 'abc123', // Not valid KEM ciphertext
      s: 'def456',
      n: 'ghi789',
      c: 'jkl012'
    });
    const result5 = await postQuantumEncryption.decryptFromSender(mlkemMismatch, keys.publicKey);
    console.log('ML-KEM Version Mismatch Result:', {
      input: mlkemMismatch,
      output: result5,
      // Success means we get a user-friendly message back - should include either "ML-KEM-768" or "decryption failed"
      success: result5.includes('[Encrypted message')
    });
    
    // Overall results
    console.log('\n\n----- TEST SUMMARY -----');
    const testsSuccess = [
      decrypted === testMessage,
      result2 === '[Encrypted message]',
      result3.includes('[Encrypted message'),
      result4.includes('[Encrypted message'),
      result5.includes('[Encrypted message')
    ];
    
    const allTestsPass = testsSuccess.every(success => success);
    console.log(`All tests pass: ${allTestsPass ? '✅ YES' : '❌ NO'}`);
    
    if (!allTestsPass) {
      console.log('Failed tests:');
      testsSuccess.forEach((success, i) => {
        if (!success) {
          console.log(`- Test ${i + 1} failed`);
        }
      });
    } else {
      console.log('✅ The encryption display fix is working correctly!');
      console.log('✅ Users will now see "[Encrypted message]" instead of raw encrypted content');
    }
    
  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    restoreMocks();
    console.log('======= END OF TESTS =======');
  }
}

// Run the tests
runTests().catch(console.error);