// tests/file-encryption.test.js - Test file encryption/decryption utilities
import { describe, it, beforeEach } from 'mocha';
import { expect } from 'chai';
import { fileEncryption } from '../src/lib/crypto/file-encryption.js';

describe('File Encryption', () => {
  beforeEach(async () => {
    // Ensure encryption service is initialized before each test
    await fileEncryption.initialize();
  });

  describe('File Encryption/Decryption', () => {
    it('should encrypt and decrypt a text file', async () => {
      const conversationId = 'test-conversation-1';
      const fileContent = new Uint8Array(Buffer.from('Hello, this is test file content!', 'utf8'));
      const fileName = 'test.txt';
      const mimeType = 'text/plain';

      // Encrypt file
      const encrypted = await fileEncryption.encryptFile(conversationId, fileContent, fileName, mimeType);

      expect(encrypted).to.be.an('object');
      expect(encrypted).to.have.property('encryptedData');
      expect(encrypted).to.have.property('metadata');
      expect(encrypted.metadata).to.have.property('originalName', fileName);
      expect(encrypted.metadata).to.have.property('mimeType', mimeType);
      expect(encrypted.metadata).to.have.property('size', fileContent.length);

      // Decrypt file
      const decrypted = await fileEncryption.decryptFile(conversationId, encrypted.encryptedData, encrypted.metadata);

      expect(decrypted).to.be.an('object');
      expect(decrypted).to.have.property('fileContent');
      expect(decrypted).to.have.property('metadata');
      
      // Verify content matches
      expect(decrypted.fileContent).to.deep.equal(fileContent);
      expect(decrypted.metadata.originalName).to.equal(fileName);
      expect(decrypted.metadata.mimeType).to.equal(mimeType);
    });

    it('should encrypt and decrypt an image file', async () => {
      const conversationId = 'test-conversation-2';
      // Create fake image data
      const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const fileName = 'test.png';
      const mimeType = 'image/png';

      const encrypted = await fileEncryption.encryptFile(conversationId, imageData, fileName, mimeType);
      const decrypted = await fileEncryption.decryptFile(conversationId, encrypted.encryptedData, encrypted.metadata);

      expect(decrypted.fileContent).to.deep.equal(imageData);
      expect(decrypted.metadata.mimeType).to.equal(mimeType);
    });

    it('should handle large files', async () => {
      const conversationId = 'test-conversation-3';
      // Create a 1MB file
      const largeFile = new Uint8Array(1024 * 1024).fill(42);
      const fileName = 'large.bin';
      const mimeType = 'application/octet-stream';

      const encrypted = await fileEncryption.encryptFile(conversationId, largeFile, fileName, mimeType);
      const decrypted = await fileEncryption.decryptFile(conversationId, encrypted.encryptedData, encrypted.metadata);

      expect(decrypted.fileContent).to.deep.equal(largeFile);
      expect(decrypted.metadata.size).to.equal(largeFile.length);
    });

    it('should throw error for empty file', async () => {
      const conversationId = 'test-conversation-4';
      const emptyFile = new Uint8Array(0);
      
      try {
        await fileEncryption.encryptFile(conversationId, emptyFile, 'empty.txt', 'text/plain');
        expect.fail('Should have thrown error for empty file');
      } catch (error) {
        expect(error.message).to.include('File content cannot be empty');
      }
    });

    it('should generate unique encrypted data for same file content', async () => {
      const conversationId = 'test-conversation-5';
      const fileContent = new Uint8Array(Buffer.from('Same content', 'utf8'));
      
      const encrypted1 = await fileEncryption.encryptFile(conversationId, fileContent, 'file1.txt', 'text/plain');
      const encrypted2 = await fileEncryption.encryptFile(conversationId, fileContent, 'file2.txt', 'text/plain');

      // Encrypted data should be different due to random nonce
      expect(encrypted1.encryptedData).to.not.equal(encrypted2.encryptedData);
      
      // But both should decrypt to the same content
      const decrypted1 = await fileEncryption.decryptFile(conversationId, encrypted1.encryptedData, encrypted1.metadata);
      const decrypted2 = await fileEncryption.decryptFile(conversationId, encrypted2.encryptedData, encrypted2.metadata);
      
      expect(decrypted1.fileContent).to.deep.equal(decrypted2.fileContent);
    });
  });

  describe('File Type Validation', () => {
    it('should validate allowed file types', () => {
      expect(fileEncryption.isAllowedFileType('test.txt')).to.be.true;
      expect(fileEncryption.isAllowedFileType('test.jpg')).to.be.true;
      expect(fileEncryption.isAllowedFileType('test.png')).to.be.true;
      expect(fileEncryption.isAllowedFileType('test.pdf')).to.be.true;
      expect(fileEncryption.isAllowedFileType('test.doc')).to.be.true;
      expect(fileEncryption.isAllowedFileType('test.mp4')).to.be.true;
    });

    it('should reject disallowed file types', () => {
      expect(fileEncryption.isAllowedFileType('test.exe')).to.be.false;
      expect(fileEncryption.isAllowedFileType('test.bat')).to.be.false;
      expect(fileEncryption.isAllowedFileType('test.scr')).to.be.false;
    });

    it('should validate file size limits', () => {
      expect(fileEncryption.isValidFileSize(1024)).to.be.true; // 1KB
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 10)).to.be.true; // 10MB
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 100)).to.be.false; // 100MB (exceeds limit)
    });
  });

  describe('File Metadata', () => {
    it('should create proper file metadata', async () => {
      const conversationId = 'test-conversation-6';
      const fileContent = new Uint8Array(Buffer.from('Test content', 'utf8'));
      
      const encrypted = await fileEncryption.encryptFile(conversationId, fileContent, 'document.txt', 'text/plain');
      
      expect(encrypted.metadata).to.have.property('id');
      expect(encrypted.metadata).to.have.property('originalName', 'document.txt');
      expect(encrypted.metadata).to.have.property('mimeType', 'text/plain');
      expect(encrypted.metadata).to.have.property('size', fileContent.length);
      expect(encrypted.metadata).to.have.property('encryptedAt');
      expect(encrypted.metadata.id).to.be.a('string');
      expect(encrypted.metadata.encryptedAt).to.be.a('string');
    });
  });
});