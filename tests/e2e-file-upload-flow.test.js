// tests/e2e-file-upload-flow.test.js - End-to-end tests for complete file upload flow
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';

describe('End-to-End File Upload Flow', () => {
  let testConversationId;
  let testMessageId;
  let testUserId;
  let testFiles;

  beforeEach(() => {
    // Mock test data
    testConversationId = 'test-conversation-e2e';
    testMessageId = 'test-message-e2e';
    testUserId = 'test-user-e2e';
    
    // Create test files for upload
    testFiles = {
      textFile: {
        name: 'test-document.txt',
        content: 'This is a test document for end-to-end testing.\nIt contains multiple lines.\n🔒 Encrypted!',
        type: 'text/plain'
      },
      imageFile: {
        name: 'test-image.png',
        // Minimal PNG header for testing
        content: new Uint8Array([
          0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
          0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
          0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
          0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
          0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE5, 0x27,
          0xDE, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
          0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
        ]),
        type: 'image/png'
      }
    };
  });

  describe('File Upload Process Validation', () => {
    it('should validate file types correctly', () => {
      const { fileEncryption } = require('../src/lib/crypto/file-encryption.js');
      
      // Test allowed types
      expect(fileEncryption.isAllowedFileType('document.txt')).to.be.true;
      expect(fileEncryption.isAllowedFileType('photo.jpg')).to.be.true;
      expect(fileEncryption.isAllowedFileType('video.mp4')).to.be.true;
      expect(fileEncryption.isAllowedFileType('archive.zip')).to.be.true;
      
      // Test blocked types
      expect(fileEncryption.isAllowedFileType('virus.exe')).to.be.false;
      expect(fileEncryption.isAllowedFileType('script.bat')).to.be.false;
      expect(fileEncryption.isAllowedFileType('malware.scr')).to.be.false;
    });

    it('should validate file sizes correctly', () => {
      const { fileEncryption } = require('../src/lib/crypto/file-encryption.js');
      
      // Valid sizes
      expect(fileEncryption.isValidFileSize(1024)).to.be.true; // 1KB
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 10)).to.be.true; // 10MB
      
      // Invalid sizes
      expect(fileEncryption.isValidFileSize(0)).to.be.false; // Empty
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 100)).to.be.false; // 100MB (too large)
    });
  });

  describe('File Encryption Integration', () => {
    it('should encrypt and decrypt files maintaining data integrity', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const textContent = new Uint8Array(Buffer.from(testFiles.textFile.content, 'utf8'));
      
      // Encrypt file
      const encrypted = await fileEncryption.encryptFile(
        testConversationId,
        textContent,
        testFiles.textFile.name,
        testFiles.textFile.type
      );

      expect(encrypted).to.have.property('encryptedData');
      expect(encrypted).to.have.property('metadata');
      expect(encrypted.metadata.originalName).to.equal(testFiles.textFile.name);
      expect(encrypted.metadata.mimeType).to.equal(testFiles.textFile.type);

      // Decrypt file
      const decrypted = await fileEncryption.decryptFile(
        testConversationId,
        encrypted.encryptedData,
        encrypted.metadata
      );

      expect(decrypted.fileContent).to.deep.equal(textContent);
      expect(decrypted.metadata.originalName).to.equal(testFiles.textFile.name);
    });

    it('should handle binary files correctly', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const imageContent = testFiles.imageFile.content;
      
      const encrypted = await fileEncryption.encryptFile(
        testConversationId,
        imageContent,
        testFiles.imageFile.name,
        testFiles.imageFile.type
      );

      const decrypted = await fileEncryption.decryptFile(
        testConversationId,
        encrypted.encryptedData,
        encrypted.metadata
      );

      expect(decrypted.fileContent).to.deep.equal(imageContent);
      expect(decrypted.metadata.mimeType).to.equal(testFiles.imageFile.type);
    });
  });

  describe('File Security Verification', () => {
    it('should produce different encrypted output for identical files', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const content = new Uint8Array(Buffer.from('Identical content', 'utf8'));
      
      const encrypted1 = await fileEncryption.encryptFile(
        testConversationId,
        content,
        'file1.txt',
        'text/plain'
      );

      const encrypted2 = await fileEncryption.encryptFile(
        testConversationId,
        content,
        'file2.txt', 
        'text/plain'
      );

      // Encrypted data should be different (due to random nonce)
      expect(encrypted1.encryptedData).to.not.equal(encrypted2.encryptedData);
      
      // But both should decrypt to same content
      const decrypted1 = await fileEncryption.decryptFile(
        testConversationId,
        encrypted1.encryptedData,
        encrypted1.metadata
      );

      const decrypted2 = await fileEncryption.decryptFile(
        testConversationId,
        encrypted2.encryptedData,
        encrypted2.metadata
      );

      expect(decrypted1.fileContent).to.deep.equal(decrypted2.fileContent);
    });

    it('should not decrypt files from different conversations', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const content = new Uint8Array(Buffer.from('Secret document', 'utf8'));
      const conversation1 = 'conv-alice';
      const conversation2 = 'conv-bob';
      
      // Encrypt for conversation 1
      const encrypted = await fileEncryption.encryptFile(
        conversation1,
        content,
        'secret.txt',
        'text/plain'
      );

      // Try to decrypt with conversation 2 key
      const decrypted = await fileEncryption.decryptFile(
        conversation2,
        encrypted.encryptedData,
        encrypted.metadata
      );

      // Should not match original content
      expect(decrypted.fileContent).to.not.deep.equal(content);
    });
  });

  describe('File Metadata Handling', () => {
    it('should generate correct metadata structure', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const content = new Uint8Array(Buffer.from('Test metadata', 'utf8'));
      
      const encrypted = await fileEncryption.encryptFile(
        testConversationId,
        content,
        'metadata-test.txt',
        'text/plain'
      );

      const metadata = encrypted.metadata;
      
      expect(metadata).to.have.property('id');
      expect(metadata).to.have.property('originalName', 'metadata-test.txt');
      expect(metadata).to.have.property('mimeType', 'text/plain');
      expect(metadata).to.have.property('size', content.length);
      expect(metadata).to.have.property('encryptedAt');
      expect(metadata).to.have.property('version');
      
      // Validate ID format
      expect(metadata.id).to.match(/^file_\d+_[a-z0-9]+$/);
      
      // Validate timestamp is recent
      const encryptedTime = new Date(metadata.encryptedAt);
      const now = new Date();
      const timeDiff = now - encryptedTime;
      expect(timeDiff).to.be.below(5000); // Within 5 seconds
    });

    it('should format file sizes correctly', () => {
      const { fileEncryption } = require('../src/lib/crypto/file-encryption.js');
      
      expect(fileEncryption.formatFileSize(0)).to.equal('0 Bytes');
      expect(fileEncryption.formatFileSize(512)).to.equal('512 Bytes');
      expect(fileEncryption.formatFileSize(1024)).to.equal('1 KB');
      expect(fileEncryption.formatFileSize(1536)).to.equal('1.5 KB');
      expect(fileEncryption.formatFileSize(1048576)).to.equal('1 MB');
      expect(fileEncryption.formatFileSize(1073741824)).to.equal('1 GB');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle encryption errors gracefully', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      // Test empty file
      try {
        await fileEncryption.encryptFile(
          testConversationId,
          new Uint8Array(0),
          'empty.txt',
          'text/plain'
        );
        expect.fail('Should have thrown error for empty file');
      } catch (error) {
        expect(error.message).to.include('File content cannot be empty');
      }

      // Test oversized file
      try {
        await fileEncryption.encryptFile(
          testConversationId,
          new Uint8Array(100 * 1024 * 1024), // 100MB
          'huge.bin',
          'application/octet-stream'
        );
        expect.fail('Should have thrown error for oversized file');
      } catch (error) {
        expect(error.message).to.include('File size exceeds maximum limit');
      }
    });

    it('should handle decryption errors gracefully', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const content = new Uint8Array(Buffer.from('Test content', 'utf8'));
      const encrypted = await fileEncryption.encryptFile(
        testConversationId,
        content,
        'test.txt',
        'text/plain'
      );

      // Test corrupted data
      const corruptedData = encrypted.encryptedData.substring(0, -20) + 'CORRUPTED_DATA';
      
      try {
        await fileEncryption.decryptFile(
          testConversationId,
          corruptedData,
          encrypted.metadata
        );
        expect.fail('Should have thrown error for corrupted data');
      } catch (error) {
        expect(error.message).to.include('Failed to decrypt file');
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple files efficiently', async function() {
      this.timeout(10000); // Increase timeout for performance test
      
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const numFiles = 5;
      const fileSize = 10 * 1024; // 10KB each
      const testContent = new Uint8Array(fileSize).fill(65); // Fill with 'A'
      
      const startTime = Date.now();
      
      const encryptPromises = [];
      for (let i = 0; i < numFiles; i++) {
        encryptPromises.push(
          fileEncryption.encryptFile(
            testConversationId,
            testContent,
            `test-file-${i}.bin`,
            'application/octet-stream'
          )
        );
      }
      
      const encryptedFiles = await Promise.all(encryptPromises);
      
      const decryptPromises = encryptedFiles.map(encrypted => 
        fileEncryption.decryptFile(
          testConversationId,
          encrypted.encryptedData,
          encrypted.metadata
        )
      );
      
      const decryptedFiles = await Promise.all(decryptPromises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      console.log(`Processed ${numFiles} files (${fileSize} bytes each) in ${totalTime}ms`);
      
      // Verify all files processed correctly
      expect(encryptedFiles).to.have.length(numFiles);
      expect(decryptedFiles).to.have.length(numFiles);
      
      decryptedFiles.forEach(decrypted => {
        expect(decrypted.fileContent).to.deep.equal(testContent);
      });
      
      // Performance should be reasonable (under 5 seconds for 5x10KB files)
      expect(totalTime).to.be.below(5000);
    });
  });

  describe('File Extension and MIME Type Handling', () => {
    it('should extract file extensions correctly', () => {
      const { fileEncryption } = require('../src/lib/crypto/file-encryption.js');
      
      expect(fileEncryption.getFileExtension('document.txt')).to.equal('.txt');
      expect(fileEncryption.getFileExtension('image.PNG')).to.equal('.png');
      expect(fileEncryption.getFileExtension('archive.tar.gz')).to.equal('.gz');
      expect(fileEncryption.getFileExtension('noextension')).to.equal('');
      expect(fileEncryption.getFileExtension('.hidden')).to.equal('');
    });

    it('should handle various MIME types correctly', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      await fileEncryption.initialize();

      const content = new Uint8Array(Buffer.from('Test content', 'utf8'));
      
      const mimeTypes = [
        'text/plain',
        'image/jpeg',
        'image/png',
        'video/mp4',
        'audio/mpeg',
        'application/pdf',
        'application/zip'
      ];

      for (const mimeType of mimeTypes) {
        const encrypted = await fileEncryption.encryptFile(
          testConversationId,
          content,
          `test.${mimeType.split('/')[1]}`,
          mimeType
        );

        expect(encrypted.metadata.mimeType).to.equal(mimeType);
        
        const decrypted = await fileEncryption.decryptFile(
          testConversationId,
          encrypted.encryptedData,
          encrypted.metadata
        );

        expect(decrypted.metadata.mimeType).to.equal(mimeType);
      }
    });
  });

  describe('Integration Readiness', () => {
    it('should have all required exports available', () => {
      const fileEncryptionModule = require('../src/lib/crypto/file-encryption.js');
      
      expect(fileEncryptionModule).to.have.property('FileEncryptionService');
      expect(fileEncryptionModule).to.have.property('fileEncryption');
      
      const fileEncryption = fileEncryptionModule.fileEncryption;
      
      // Check all required methods exist
      expect(fileEncryption).to.have.property('initialize').that.is.a('function');
      expect(fileEncryption).to.have.property('encryptFile').that.is.a('function');
      expect(fileEncryption).to.have.property('decryptFile').that.is.a('function');
      expect(fileEncryption).to.have.property('isAllowedFileType').that.is.a('function');
      expect(fileEncryption).to.have.property('isValidFileSize').that.is.a('function');
      expect(fileEncryption).to.have.property('formatFileSize').that.is.a('function');
      expect(fileEncryption).to.have.property('isReady').that.is.a('function');
    });

    it('should be ready for frontend integration', async () => {
      const { fileEncryption } = await import('../src/lib/crypto/file-encryption.js');
      
      // Should start uninitialized
      expect(fileEncryption.isReady()).to.be.false;
      
      // Should initialize successfully
      await fileEncryption.initialize();
      expect(fileEncryption.isReady()).to.be.true;
      
      // Should handle re-initialization gracefully
      await fileEncryption.initialize();
      expect(fileEncryption.isReady()).to.be.true;
    });
  });
});