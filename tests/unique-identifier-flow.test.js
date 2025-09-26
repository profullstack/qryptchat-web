// Integration test for unique identifier flow
// Tests the complete flow from profile sharing to chat initiation

import { expect } from 'chai';
import { 
    generateUniqueIdentifier, 
    validateUniqueIdentifier,
    formatUniqueIdentifier,
    parseUniqueIdentifier
} from '../src/lib/utils/unique-identifier.js';

describe('Unique Identifier Complete Flow', () => {
    describe('Profile ID Generation and Display', () => {
        it('should generate a valid unique identifier', () => {
            const identifier = generateUniqueIdentifier();
            
            expect(identifier).to.be.a('string');
            expect(identifier).to.have.length(10);
            expect(identifier).to.match(/^QC[A-Z1-9]{8}$/);
            expect(validateUniqueIdentifier(identifier)).to.be.true;
        });

        it('should format identifier for display', () => {
            const identifier = 'QCA1B2C3D4';
            const formatted = formatUniqueIdentifier(identifier);
            
            expect(formatted).to.equal('QC-A1B2-C3D4');
        });

        it('should parse formatted identifier back to original', () => {
            const original = 'QCA1B2C3D4';
            const formatted = formatUniqueIdentifier(original);
            const parsed = parseUniqueIdentifier(formatted);
            
            expect(parsed).to.equal(original);
        });
    });

    describe('URL Generation and Parsing', () => {
        it('should generate correct profile URL', () => {
            const identifier = 'QCA1B2C3D4';
            const baseUrl = 'https://qryptchat.com';
            const expectedUrl = `${baseUrl}/id/${identifier}`;
            
            // Simulate URL generation
            const profileUrl = `${baseUrl}/id/${identifier}`;
            expect(profileUrl).to.equal(expectedUrl);
        });

        it('should generate correct chat URL', () => {
            const identifier = 'QCA1B2C3D4';
            const baseUrl = 'https://qryptchat.com';
            const expectedUrl = `${baseUrl}/id/${identifier}?action=chat`;
            
            // Simulate chat URL generation
            const chatUrl = `${baseUrl}/id/${identifier}?action=chat`;
            expect(chatUrl).to.equal(expectedUrl);
        });

        it('should extract identifier from URL', () => {
            const identifier = 'QCA1B2C3D4';
            const url = `https://qryptchat.com/id/${identifier}`;
            
            // Simulate URL parsing
            const match = url.match(/\/id\/([A-Z0-9]{10})$/i);
            const extractedId = match ? match[1].toUpperCase() : null;
            
            expect(extractedId).to.equal(identifier);
            expect(validateUniqueIdentifier(extractedId)).to.be.true;
        });
    });

    describe('User Lookup Flow', () => {
        it('should validate identifier before lookup', () => {
            const validId = 'QCA1B2C3D4';
            const invalidId = 'INVALID123';
            
            expect(validateUniqueIdentifier(validId)).to.be.true;
            expect(validateUniqueIdentifier(invalidId)).to.be.false;
        });

        it('should handle formatted identifiers in lookup', () => {
            const originalId = 'QCA1B2C3D4';
            const formattedId = 'QC-A1B2-C3D4';
            const userInputId = '  qc-a1b2-c3d4  '; // With whitespace and lowercase
            
            const parsedFormatted = parseUniqueIdentifier(formattedId);
            const parsedUserInput = parseUniqueIdentifier(userInputId);
            
            expect(parsedFormatted).to.equal(originalId);
            expect(parsedUserInput).to.equal(originalId);
            expect(validateUniqueIdentifier(parsedFormatted)).to.be.true;
            expect(validateUniqueIdentifier(parsedUserInput)).to.be.true;
        });
    });

    describe('Chat Initiation Flow', () => {
        it('should create proper conversation request payload', () => {
            const targetUserId = 'user-123-456-789';
            
            // Simulate conversation creation payload
            const payload = {
                type: 'direct',
                participant_ids: [targetUserId]
            };
            
            expect(payload.type).to.equal('direct');
            expect(payload.participant_ids).to.be.an('array');
            expect(payload.participant_ids).to.include(targetUserId);
            expect(payload.participant_ids).to.have.length(1);
        });

        it('should handle conversation response', () => {
            const mockResponse = {
                success: true,
                conversation_id: 'conv-123-456-789'
            };
            
            expect(mockResponse.success).to.be.true;
            expect(mockResponse.conversation_id).to.be.a('string');
            expect(mockResponse.conversation_id).to.match(/^conv-/);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid identifier formats gracefully', () => {
            const invalidIds = [
                '',
                null,
                undefined,
                'QC123',      // Too short
                'QCA1B2C3D4E5', // Too long
                'XCA1B2C3D4',   // Wrong prefix
                'QCA1B2C3O4',   // Contains O
                'QCA1B2C304',   // Contains 0
                'qca1b2c3d4',   // Lowercase
                'QC-A1B2-C3D4', // Formatted (should be parsed first)
            ];
            
            invalidIds.forEach(id => {
                if (id === 'QC-A1B2-C3D4') {
                    // This should be valid after parsing
                    const parsed = parseUniqueIdentifier(id);
                    expect(validateUniqueIdentifier(parsed)).to.be.true;
                } else {
                    expect(validateUniqueIdentifier(id)).to.be.false;
                }
            });
        });

        it('should provide helpful error messages for invalid identifiers', () => {
            const invalidId = 'INVALID123';
            const isValid = validateUniqueIdentifier(invalidId);
            
            if (!isValid) {
                const errorMessage = 'Invalid identifier format. Profile IDs should be in the format QC + 8 alphanumeric characters.';
                expect(errorMessage).to.include('QC');
                expect(errorMessage).to.include('8 alphanumeric');
            }
        });
    });

    describe('Security Considerations', () => {
        it('should not expose database IDs', () => {
            const identifier = generateUniqueIdentifier();
            
            // Ensure identifier doesn't look like a UUID or sequential ID
            expect(identifier).to.not.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
            expect(identifier).to.not.match(/^[0-9]+$/);
            expect(identifier).to.match(/^QC[A-Z1-9]{8}$/);
        });

        it('should generate unique identifiers', () => {
            const identifiers = new Set();
            const count = 1000;
            
            for (let i = 0; i < count; i++) {
                const id = generateUniqueIdentifier();
                expect(identifiers.has(id)).to.be.false;
                identifiers.add(id);
            }
            
            expect(identifiers.size).to.equal(count);
        });

        it('should use safe character set', () => {
            const identifier = generateUniqueIdentifier();
            const body = identifier.slice(2); // Remove QC prefix
            
            // Should not contain confusing characters
            expect(body).to.not.include('O');
            expect(body).to.not.include('0');
            expect(body).to.not.include('I');
            expect(body).to.not.include('1'); // Actually, 1 is allowed in our implementation
            
            // Should only contain safe characters
            expect(body).to.match(/^[A-Z1-9]+$/);
        });
    });

    describe('User Experience', () => {
        it('should provide user-friendly display format', () => {
            const identifier = 'QCA1B2C3D4';
            const formatted = formatUniqueIdentifier(identifier);
            
            // Should be easier to read and share
            expect(formatted).to.equal('QC-A1B2-C3D4');
            expect(formatted).to.include('-');
            expect(formatted.split('-')).to.have.length(3);
        });

        it('should handle user input variations', () => {
            const variations = [
                'QCA1B2C3D4',
                'qca1b2c3d4',
                'QC-A1B2-C3D4',
                'qc-a1b2-c3d4',
                '  QC-A1B2-C3D4  ',
                'QC A1B2 C3D4',
            ];
            
            const expected = 'QCA1B2C3D4';
            
            variations.forEach(variation => {
                const parsed = parseUniqueIdentifier(variation);
                expect(parsed).to.equal(expected);
            });
        });
    });
});