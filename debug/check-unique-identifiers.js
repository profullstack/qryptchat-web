// Debug script to check unique identifier generation and database state
// Run with: node debug/check-unique-identifiers.js

import { generateUniqueIdentifier, validateUniqueIdentifier, formatUniqueIdentifier } from '../src/lib/utils/unique-identifier.js';

console.log('🔍 Unique Identifier Diagnostic');
console.log('================================');

// Test identifier generation
console.log('\n1. Testing identifier generation:');
for (let i = 0; i < 5; i++) {
    const id = generateUniqueIdentifier();
    const formatted = formatUniqueIdentifier(id);
    const isValid = validateUniqueIdentifier(id);
    
    console.log(`   Generated: ${id}`);
    console.log(`   Formatted: ${formatted}`);
    console.log(`   Valid: ${isValid}`);
    console.log(`   Length: ${id.length}`);
    console.log('   ---');
}

// Test old format validation
console.log('\n2. Testing old format validation:');
const oldFormat = 'QCE92DZEIG';
console.log(`   Old format: ${oldFormat}`);
console.log(`   Is valid: ${validateUniqueIdentifier(oldFormat)}`);

// Test new format validation
console.log('\n3. Testing new format validation:');
const newFormat = 'qryptchat_A1B2C3D4';
console.log(`   New format: ${newFormat}`);
console.log(`   Is valid: ${validateUniqueIdentifier(newFormat)}`);
console.log(`   Formatted: ${formatUniqueIdentifier(newFormat)}`);

console.log('\n✅ Diagnostic complete');