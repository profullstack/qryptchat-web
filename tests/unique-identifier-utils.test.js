// Test suite for unique identifier utilities
// Using Mocha test framework with Chai assertions

import { expect } from 'chai';
import { 
    generateUniqueIdentifier, 
    validateUniqueIdentifier, 
    formatUniqueIdentifier,
    parseUniqueIdentifier 
} from '../src/lib/utils/unique-identifier.js';

describe('Unique Identifier Utils', () => {
    describe('generateUniqueIdentifier', () => {
        it('should generate a unique identifier with QC prefix', () => {
            const identifier = generateUniqueIdentifier();
            expect(identifier).to.be.a('string');
            expect(identifier).to.match(/^QC[A-Z1-9]{8}$/);
        });

        it('should generate different identifiers on multiple calls', () => {
            const id1 = generateUniqueIdentifier();
            const id2 = generateUniqueIdentifier();
            expect(id1).to.not.equal(id2);
        });

        it('should generate identifiers of consistent length', () => {
            const identifier = generateUniqueIdentifier();
            expect(identifier).to.have.length(10); // QC + 8 characters
        });

        it('should not include confusing characters (O, 0)', () => {
            // Generate multiple identifiers to test character set
            for (let i = 0; i < 100; i++) {
                const identifier = generateUniqueIdentifier();
                expect(identifier).to.not.include('O');
                expect(identifier).to.not.include('0');
            }
        });
    });

    describe('validateUniqueIdentifier', () => {
        it('should validate correct unique identifiers', () => {
            expect(validateUniqueIdentifier('QCA1B2C3D4')).to.be.true;
            expect(validateUniqueIdentifier('QCXYZ12345')).to.be.true;
            expect(validateUniqueIdentifier('QC9876ABCD')).to.be.true;
        });

        it('should reject identifiers without QC prefix', () => {
            expect(validateUniqueIdentifier('A1B2C3D4E5')).to.be.false;
            expect(validateUniqueIdentifier('XCA1B2C3D4')).to.be.false;
        });

        it('should reject identifiers with wrong length', () => {
            expect(validateUniqueIdentifier('QCA1B2C3')).to.be.false; // Too short
            expect(validateUniqueIdentifier('QCA1B2C3D4E5')).to.be.false; // Too long
        });

        it('should reject identifiers with invalid characters', () => {
            expect(validateUniqueIdentifier('QCA1B2C3O4')).to.be.false; // Contains O
            expect(validateUniqueIdentifier('QCA1B2C304')).to.be.false; // Contains 0
            expect(validateUniqueIdentifier('QCA1B2C3d4')).to.be.false; // Contains lowercase
            expect(validateUniqueIdentifier('QCA1B2C3@4')).to.be.false; // Contains special char
        });

        it('should reject null, undefined, and empty strings', () => {
            expect(validateUniqueIdentifier(null)).to.be.false;
            expect(validateUniqueIdentifier(undefined)).to.be.false;
            expect(validateUniqueIdentifier('')).to.be.false;
            expect(validateUniqueIdentifier('   ')).to.be.false;
        });
    });

    describe('formatUniqueIdentifier', () => {
        it('should format identifier with dashes for readability', () => {
            expect(formatUniqueIdentifier('QCA1B2C3D4')).to.equal('QC-A1B2-C3D4');
            expect(formatUniqueIdentifier('QCXYZ12345')).to.equal('QC-XYZ1-2345');
        });

        it('should handle invalid identifiers gracefully', () => {
            expect(formatUniqueIdentifier('invalid')).to.equal('invalid');
            expect(formatUniqueIdentifier('')).to.equal('');
            expect(formatUniqueIdentifier(null)).to.equal('');
        });
    });

    describe('parseUniqueIdentifier', () => {
        it('should parse formatted identifiers back to original format', () => {
            expect(parseUniqueIdentifier('QC-A1B2-C3D4')).to.equal('QCA1B2C3D4');
            expect(parseUniqueIdentifier('QC-XYZ1-2345')).to.equal('QCXYZ12345');
        });

        it('should handle unformatted identifiers', () => {
            expect(parseUniqueIdentifier('QCA1B2C3D4')).to.equal('QCA1B2C3D4');
        });

        it('should normalize whitespace and case', () => {
            expect(parseUniqueIdentifier('  qc-a1b2-c3d4  ')).to.equal('QCA1B2C3D4');
            expect(parseUniqueIdentifier('qca1b2c3d4')).to.equal('QCA1B2C3D4');
        });

        it('should handle invalid input gracefully', () => {
            expect(parseUniqueIdentifier('')).to.equal('');
            expect(parseUniqueIdentifier(null)).to.equal('');
            expect(parseUniqueIdentifier(undefined)).to.equal('');
        });
    });

    describe('Integration tests', () => {
        it('should generate, format, and parse identifiers consistently', () => {
            const original = generateUniqueIdentifier();
            const formatted = formatUniqueIdentifier(original);
            const parsed = parseUniqueIdentifier(formatted);
            
            expect(parsed).to.equal(original);
            expect(validateUniqueIdentifier(parsed)).to.be.true;
        });

        it('should handle round-trip formatting correctly', () => {
            const testIds = ['QCA1B2C3D4', 'QCXYZ12345', 'QC9876ABCD'];
            
            testIds.forEach(id => {
                const formatted = formatUniqueIdentifier(id);
                const parsed = parseUniqueIdentifier(formatted);
                expect(parsed).to.equal(id);
            });
        });
    });
});