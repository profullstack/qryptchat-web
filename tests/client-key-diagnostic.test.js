import { describe, it } from 'vitest';

describe('Client-Side Key Diagnostic', () => {
  it('should provide instructions to investigate User B key storage and decryption', () => {
    console.log(`
🔑 [CLIENT KEY DIAGNOSTIC] Investigation Steps for User B (profullstack):

==================== STEP 1: Check localStorage Keys ====================
Open browser DevTools (F12) as User B (profullstack) and run:

console.log('🔑 [KEYS] Checking localStorage keys...');
const keys = Object.keys(localStorage).filter(key => key.includes('key') || key.includes('crypto') || key.includes('ml-kem'));
console.log('🔑 [KEYS] Found keys:', keys);
keys.forEach(key => {
  const value = localStorage.getItem(key);
  console.log(\`🔑 [KEYS] \${key}: \${value?.substring(0, 100)}...\`);
});

==================== STEP 2: Check ML-KEM Key Pairs ====================
// Check if ML-KEM keys exist and are valid
const mlKemKeys = localStorage.getItem('ml-kem-keypair');
if (mlKemKeys) {
  console.log('🔑 [ML-KEM] Keys found, length:', mlKemKeys.length);
  try {
    const parsed = JSON.parse(mlKemKeys);
    console.log('🔑 [ML-KEM] Public key length:', parsed.publicKey?.length || 'missing');
    console.log('🔑 [ML-KEM] Private key length:', parsed.privateKey?.length || 'missing');
  } catch (e) {
    console.error('🔑 [ML-KEM] Failed to parse keys:', e);
  }
} else {
  console.error('🔑 [ML-KEM] NO KEYS FOUND - This is the problem!');
}

==================== STEP 3: Check Database Keys ====================
// Check if User B has keys stored in database
fetch('/api/user/keys', {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
}).then(r => r.json()).then(data => {
  console.log('🔑 [DB] Database keys:', data);
}).catch(e => console.error('🔑 [DB] Error fetching keys:', e));

==================== STEP 4: Test Key Decryption ====================
// Try to decrypt a sample message manually
const sampleEncryptedContent = \`{"v":3,"alg":"ML-KEM-768","kem":"1xZrVUGfRsiFMHA6ws5vzp5JsNnS7zFxg/6lzEpLEIcrJbvmTkbGTk1rR+XmatJZfoU...","n":"fIE8f3Gb8svT18ys","c":"ZIv42+BfY5ZNXniFhMEWPMkzXKU=","t":1757524698669}\`;

// This should be done in the browser console as User B
console.log('🔑 [TEST] Testing decryption with User B keys...');
// The actual decryption test would need to be run in the browser context

==================== STEP 5: Compare Keys Between Users ====================
// As User A (chovy), check keys:
console.log('🔑 [COMPARE] User A (chovy) keys:');
const userAKeys = localStorage.getItem('ml-kem-keypair');
console.log('🔑 [COMPARE] User A key length:', userAKeys?.length || 'missing');

// Then switch to User B and compare
console.log('🔑 [COMPARE] User B (profullstack) keys:');
const userBKeys = localStorage.getItem('ml-kem-keypair');
console.log('🔑 [COMPARE] User B key length:', userBKeys?.length || 'missing');

==================== EXPECTED RESULTS ====================
✅ GOOD: Both users have different ML-KEM key pairs in localStorage
✅ GOOD: Both users have keys stored in database
✅ GOOD: User B can decrypt sample content

❌ BAD: User B missing keys in localStorage
❌ BAD: User B has same keys as User A (key collision)
❌ BAD: User B keys don't match database keys
❌ BAD: User B decryption fails with valid keys

==================== LIKELY SOLUTIONS ====================
If User B has no keys: Regenerate keys for User B
If User B has wrong keys: Clear localStorage and regenerate
If keys don't match DB: Sync localStorage with database
If decryption still fails: Check key format/encoding issues

🎯 [ACTION REQUIRED]
1. Open incognito window as User B (profullstack)
2. Run the localStorage diagnostic commands above
3. Report what you find - especially if keys are missing or invalid
4. We'll then implement the appropriate fix
`);
  });
});