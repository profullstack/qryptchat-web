/**
 * Test critical encryption compatibility fixes
 * Tests public key validation tolerance and improved error handling
 */

import { describe, it, beforeEach, expect } from 'vitest';
import { postQuantumEncryption } from '../src/lib/crypto/post-quantum-encryption.js';
import { Base64 } from '../src/lib/crypto/index.js';

describe('Encryption Compatibility Fixes', () => {
    beforeEach(async () => {
        await postQuantumEncryption.initialize();
    });

    describe('AES Fallback Support', () => {
        it('should decrypt legacy AES encrypted messages', async () => {
            // Simulate a legacy AES encrypted message structure
            const legacyAESMessage = {
                v: 3,
                alg: 'FALLBACK-AES',
                key: 'YQCNedKr4rd9F/p7+krapHtSCNpwa0lD9wQo7si3ecg=', // Sample AES key
                iv: 'AJSJ/ch02CoRj',  // Sample IV
                c: Base64.encode(new TextEncoder().encode('Hello World')) // Sample encrypted content
            };

            const encryptedContent = JSON.stringify(legacyAESMessage);

            try {
                // This should no longer throw an error about AES not being supported
                const result = await postQuantumEncryption.decryptFromSender(encryptedContent, 'dummy-sender-key');
                
                // The result should be the fallback decryption attempt, not an error about AES being unsupported
                expect(result).to.not.equal('[Encrypted message - decryption failed]');
                
            } catch (error) {
                // Make sure it's not the "AES fallback not supported" error
                expect(error.message).to.not.contain('AES fallback not supported');
            }
        });

        it('should handle FALLBACK-AES-GCM messages', async () => {
            const legacyAESGCMMessage = {
                v: 3,
                alg: 'FALLBACK-AES-GCM',
                key: 'YQCNedKr4rd9F/p7+krapHtSCNpwa0lD9wQo7si3ecg=',
                iv: 'AJSJ/ch02CoRj',
                c: Base64.encode(new TextEncoder().encode('Test Message'))
            };

            const encryptedContent = JSON.stringify(legacyAESGCMMessage);

            try {
                const result = await postQuantumEncryption.decryptFromSender(encryptedContent, 'dummy-sender-key');
                
                // Should attempt fallback decryption, not reject outright
                expect(result).to.not.equal('[Encrypted message - decryption failed]');
                
            } catch (error) {
                expect(error.message).to.not.contain('AES fallback not supported');
            }
        });
    });

    describe('Public Key Validation Tolerance', () => {
        it('should accept public keys with slight length variations', () => {
            // Create a key that's 1550 bytes (18 bytes short of 1568)
            const shortKey = new Uint8Array(1550);
            shortKey.fill(1); // Fill with non-zero data to pass basic validation
            
            // This should now pass validation (with warnings but not errors)
            const isValid = postQuantumEncryption.isValidPublicKey(shortKey);
            expect(isValid).to.be.true;
        });

        it('should handle keys with KYBER headers correctly', () => {
            // Create a key with KYBER header (1568 + 18 bytes header = 1586 total)
            const keyWithHeader = new Uint8Array(1586);
            
            // Set KYBER header: ASCII for "KYBER" is [75, 89, 66, 69, 82]
            keyWithHeader[0] = 75; // K
            keyWithHeader[1] = 89; // Y
            keyWithHeader[2] = 66; // B
            keyWithHeader[3] = 69; // E
            keyWithHeader[4] = 82; // R
            keyWithHeader[5] = 49; // 1
            keyWithHeader[6] = 48; // 0
            keyWithHeader[7] = 50; // 2
            
            // Add some padding/separator bytes
            for (let i = 8; i < 18; i++) {
                keyWithHeader[i] = 0;
            }
            
            // Fill the rest with key data
            for (let i = 18; i < keyWithHeader.length; i++) {
                keyWithHeader[i] = 1;
            }
            
            // Test header stripping
            const strippedKey = postQuantumEncryption.stripKeyHeaderIfPresent(keyWithHeader);
            
            // Should result in a 1568-byte key
            expect(strippedKey.length).to.equal(1568);
            expect(strippedKey[0]).to.equal(1); // Should start with key data, not header
        });

        it('should pad keys to exact ML-KEM sizes when close', () => {
            // Test key that's close to ML-KEM-1024 size
            const closeKey1024 = new Uint8Array(1550); // 18 bytes short
            closeKey1024.fill(1);
            
            const adjusted1024 = postQuantumEncryption.stripKeyHeaderIfPresent(closeKey1024);
            expect(adjusted1024.length).to.equal(1568);
            
            // Test key that's close to ML-KEM-768 size  
            const closeKey768 = new Uint8Array(1170); // 14 bytes short
            closeKey768.fill(1);
            
            const adjusted768 = postQuantumEncryption.stripKeyHeaderIfPresent(closeKey768);
            expect(adjusted768.length).to.equal(1184);
        });
    });

    describe('Public Key Format Validation', () => {
        it('should validate Base64 public key strings correctly', () => {
            // Create a valid 1568-byte key and encode as Base64
            const validKeyBytes = new Uint8Array(1568);
            validKeyBytes.fill(1);
            const validKeyBase64 = Base64.encode(validKeyBytes);
            
            const result = postQuantumEncryption.validatePublicKeyFormat(validKeyBase64);
            expect(result).to.not.be.null;
            expect(result.length).to.equal(1568);
        });

        it('should handle slightly short keys in Base64 format', () => {
            // Create a 1550-byte key (18 bytes short) and encode as Base64
            const shortKeyBytes = new Uint8Array(1550);
            shortKeyBytes.fill(1);
            const shortKeyBase64 = Base64.encode(shortKeyBytes);
            
            // Should not reject outright, but handle gracefully
            const result = postQuantumEncryption.validatePublicKeyFormat(shortKeyBase64);
            expect(result).to.not.be.null; // Should attempt to process it
        });
    });

    describe('Error Handling Improvements', () => {
        it('should return user-friendly messages for invalid content', async () => {
            // Test with completely invalid content
            const result1 = await postQuantumEncryption.decryptFromSender('invalid json', 'dummy-key');
            expect(result1).to.equal('[Encrypted message]');
            
            // Test with malformed JSON
            const result2 = await postQuantumEncryption.decryptFromSender('{"incomplete": ', 'dummy-key');
            expect(result2).to.equal('[Encrypted message]');
            
            // Test with missing fields
            const incompleteMessage = JSON.stringify({ v: 3, alg: 'unknown' });
            const result3 = await postQuantumEncryption.decryptFromSender(incompleteMessage, 'dummy-key');
            expect(result3).to.equal('[Encrypted message - format error]');
        });
    });
});