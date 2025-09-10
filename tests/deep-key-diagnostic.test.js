import { describe, it } from 'vitest';

describe('Deep Key Diagnostic', () => {
  it('should provide advanced key mismatch diagnostic for User B', () => {
    console.log(`
🔍 [DEEP DIAGNOSTIC] Advanced Key Analysis for User B:

==================== STEP 1: Verify Key Migration Worked ====================
Run in User B's console:

const mlKemKeys = localStorage.getItem('ml-kem-keypair');
const oldKeys = localStorage.getItem('qryptchat_pq_keypair');
console.log('🔍 [KEYS] ml-kem-keypair exists:', !!mlKemKeys);
console.log('🔍 [KEYS] qryptchat_pq_keypair exists:', !!oldKeys);
console.log('🔍 [KEYS] Keys are identical:', mlKemKeys === oldKeys);

==================== STEP 2: Check Database vs localStorage Keys ====================
// Compare User B's localStorage keys with database keys

// First, get localStorage keys
const localKeys = JSON.parse(localStorage.getItem('ml-kem-keypair') || '{}');
console.log('🔍 [LOCAL] Public key preview:', localKeys.publicKey?.substring(0, 50));

// Then fetch database keys
fetch('/api/user/profile', {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' }
}).then(r => r.json()).then(profile => {
  console.log('🔍 [DB] User profile:', profile);
  
  // Check if there's a key mismatch
  if (profile.ml_kem_public_key) {
    const dbPublicKey = profile.ml_kem_public_key;
    const localPublicKey = localKeys.publicKey;
    
    console.log('🔍 [COMPARE] DB public key preview:', dbPublicKey?.substring(0, 50));
    console.log('🔍 [COMPARE] Local public key preview:', localPublicKey?.substring(0, 50));
    console.log('🔍 [COMPARE] Keys match:', dbPublicKey === localPublicKey);
    
    if (dbPublicKey !== localPublicKey) {
      console.error('🚨 [MISMATCH] DATABASE AND LOCALSTORAGE KEYS DO NOT MATCH!');
      console.error('🚨 [MISMATCH] This is why decryption fails!');
    }
  }
}).catch(e => console.error('🔍 [DB] Error fetching profile:', e));

==================== STEP 3: Test Manual Decryption ====================
// Try to manually decrypt a message to see exact error

const sampleMessage = \`{"v":3,"alg":"ML-KEM-768","kem":"1xZrVUGfRsiFMHA6ws5vzp5JsNnS7zFxg/6lzEpLEIcrJbvmTkbGTk1rR+XmatJZfoU","n":"fIE8f3Gb8svT18ys","c":"ZIv42+BfY5ZNXniFhMEWPMkzXKU=","t":1757524698669}\`;

// This would need to be run in the actual app context
console.log('🔍 [DECRYPT] Sample message to test:', sampleMessage);
console.log('🔍 [DECRYPT] Try decrypting this manually in the app');

==================== STEP 4: Check User A Keys for Comparison ====================
// Switch to User A (chovy) and run:
console.log('🔍 [COMPARE] User A (chovy) keys:');
const userAKeys = JSON.parse(localStorage.getItem('ml-kem-keypair') || '{}');
console.log('🔍 [COMPARE] User A public key preview:', userAKeys.publicKey?.substring(0, 50));

// Then compare with User B
console.log('🔍 [COMPARE] Are User A and B keys identical?', 
  userAKeys.publicKey === localKeys.publicKey);

==================== LIKELY ROOT CAUSES ====================

🚨 SCENARIO 1: Key Mismatch (Database vs localStorage)
- User B's localStorage has old/wrong keys
- Database has different keys that were used for encryption
- Solution: Sync localStorage with database OR regenerate all keys

🚨 SCENARIO 2: User B Never Had Proper Keys Generated
- User B's account was created before proper key generation
- Messages were encrypted with placeholder/default keys
- Solution: Complete key regeneration and re-encryption

🚨 SCENARIO 3: Key Collision (Same keys as User A)
- Both users somehow have identical keys
- This would cause cross-user decryption issues
- Solution: Regenerate unique keys for User B

==================== NEXT STEPS BASED ON FINDINGS ====================

IF Database keys ≠ localStorage keys:
  → Sync localStorage with database keys
  
IF User A keys = User B keys:
  → Regenerate unique keys for User B
  
IF Keys look correct but decryption still fails:
  → Check message format/encoding issues
  → Verify ML-KEM implementation compatibility

🎯 [ACTION REQUIRED]
Run the diagnostic scripts above and report:
1. Do localStorage and database keys match?
2. Are User A and User B keys different?
3. What specific error occurs during manual decryption?
`);
  });
});