// tests/file-upload-integration.test.js - Integration tests for file upload system
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import { fileEncryption } from '../src/lib/crypto/file-encryption.js';

describe('File Upload Integration Tests', () => {
  let mockConversationId;
  let testFiles;

  beforeEach(async () => {
    // Initialize file encryption service
    await fileEncryption.initialize();
    
    mockConversationId = 'test-conversation-123';
    
    // Create test files
    testFiles = {
      textFile: {
        name: 'test.txt',
        content: new Uint8Array(Buffer.from('Hello, this is a test file!', 'utf8')),
        mimeType: 'text/plain'
      },
      imageFile: {
        name: 'test.png',
        content: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        mimeType: 'image/png'
      },
      largeFile: {
        name: 'large.bin',
        content: new Uint8Array(1024 * 100), // 100KB
        mimeType: 'application/octet-stream'
      }
    };
    
    // Fill large file with test data
    testFiles.largeFile.content.fill(42);
  });

  describe('File Type Validation', () => {
    it('should allow common file types', () => {
      const allowedTypes = [
        'document.txt',
        'image.jpg',
        'image.png',
        'video.mp4',
        'audio.mp3',
        'document.pdf',
        'spreadsheet.xlsx',
        'archive.zip'
      ];

      allowedTypes.forEach(filename => {
        expect(fileEncryption.isAllowedFileType(filename)).to.be.true;
      });
    });

    it('should reject dangerous file types', () => {
      const dangerousTypes = [
        'virus.exe',
        'script.bat',
        'malware.scr',
        'trojan.com',
        'bad.msi'
      ];

      dangerousTypes.forEach(filename => {
        expect(fileEncryption.isAllowedFileType(filename)).to.be.false;
      });
    });

    it('should validate file sizes correctly', () => {
      expect(fileEncryption.isValidFileSize(1024)).to.be.true; // 1KB
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 10)).to.be.true; // 10MB
      expect(fileEncryption.isValidFileSize(1024 * 1024 * 100)).to.be.false; // 100MB (exceeds limit)
      expect(fileEncryption.isValidFileSize(0)).to.be.false; // Empty file
    });
  });

  describe('End-to-End File Processing', () => {
    it('should encrypt, then decrypt a text file maintaining integrity', async () => {
      const file = testFiles.textFile;
      
      // Encrypt file
      const encrypted = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        file.name,
        file.mimeType
      );

      expect(encrypted).to.have.property('encryptedData');
      expect(encrypted).to.have.property('metadata');
      expect(encrypted.metadata).to.have.property('originalName', file.name);
      expect(encrypted.metadata).to.have.property('mimeType', file.mimeType);

      // Decrypt file
      const decrypted = await fileEncryption.decryptFile(
        mockConversationId,
        encrypted.encryptedData,
        encrypted.metadata
      );

      expect(decrypted.fileContent).to.deep.equal(file.content);
      expect(decrypted.metadata.originalName).to.equal(file.name);
      expect(decrypted.metadata.mimeType).to.equal(file.mimeType);
    });

    it('should handle binary files correctly', async () => {
      const file = testFiles.imageFile;
      
      const encrypted = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        file.name,
        file.mimeType
      );

      const decrypted = await fileEncryption.decryptFile(
        mockConversationId,
        encrypted.encryptedData,
        encrypted.metadata
      );

      expect(decrypted.fileContent).to.deep.equal(file.content);
      expect(decrypted.metadata.mimeType).to.equal(file.mimeType);
    });

    it('should handle large files efficiently', async () => {
      const file = testFiles.largeFile;
      
      const startTime = Date.now();
      
      const encrypted = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        file.name,
        file.mimeType
      );

      const decrypted = await fileEncryption.decryptFile(
        mockConversationId,
        encrypted.encryptedData,
        encrypted.metadata
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time (under 5 seconds for 100KB)
      expect(processingTime).to.be.below(5000);
      
      expect(decrypted.fileContent).to.deep.equal(file.content);
      expect(decrypted.metadata.size).to.equal(file.content.length);
    });

    it('should produce different encrypted output for same file content', async () => {
      const file = testFiles.textFile;
      
      const encrypted1 = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        'file1.txt',
        file.mimeType
      );

      const encrypted2 = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        'file2.txt',
        file.mimeType
      );

      // Encrypted data should be different due to random nonce
      expect(encrypted1.encryptedData).to.not.equal(encrypted2.encryptedData);
      
      // But both should decrypt to the same content
      const decrypted1 = await fileEncryption.decryptFile(
        mockConversationId,
        encrypted1.encryptedData,
        encrypted1.metadata
      );

      const decrypted2 = await fileEncryption.decryptFile(
        mockConversationId,
        encrypted2.encryptedData,
        encrypted2.metadata
      );

      expect(decrypted1.fileContent).to.deep.equal(decrypted2.fileContent);
    });
  });

  describe('Error Handling', () => {
    it('should reject empty files', async () => {
      const emptyFile = new Uint8Array(0);
      
      try {
        await fileEncryption.encryptFile(
          mockConversationId,
          emptyFile,
          'empty.txt',
          'text/plain'
        );
        expect.fail('Should have thrown error for empty file');
      } catch (error) {
        expect(error.message).to.include('File content cannot be empty');
      }
    });

    it('should reject files that are too large', async () => {
      const hugeFile = new Uint8Array(100 * 1024 * 1024); // 100MB
      
      try {
        await fileEncryption.encryptFile(
          mockConversationId,
          hugeFile,
          'huge.bin',
          'application/octet-stream'
        );
        expect.fail('Should have thrown error for oversized file');
      } catch (error) {
        expect(error.message).to.include('File size exceeds maximum limit');
      }
    });

    it('should reject disallowed file types', async () => {
      const file = testFiles.textFile;
      
      try {
        await fileEncryption.encryptFile(
          mockConversationId,
          file.content,
          'malware.exe',
          'application/x-msdownload'
        );
        expect.fail('Should have thrown error for disallowed file type');
      } catch (error) {
        expect(error.message).to.include('File type not allowed');
      }
    });

    it('should handle decryption of corrupted data gracefully', async () => {
      const file = testFiles.textFile;
      const encrypted = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        file.name,
        file.mimeType
      );

      // Corrupt the encrypted data
      const corruptedData = encrypted.encryptedData.substring(0, -10) + 'CORRUPTED';

      try {
        await fileEncryption.decryptFile(
          mockConversationId,
          corruptedData,
          encrypted.metadata
        );
        expect.fail('Should have thrown error for corrupted data');
      } catch (error) {
        expect(error.message).to.include('Failed to decrypt file');
      }
    });
  });

  describe('File Metadata Generation', () => {
    it('should generate proper metadata for files', async () => {
      const file = testFiles.textFile;
      
      const encrypted = await fileEncryption.encryptFile(
        mockConversationId,
        file.content,
        file.name,
        file.mimeType
      );

      const metadata = encrypted.metadata;
      
      expect(metadata).to.have.property('id');
      expect(metadata).to.have.property('originalName', file.name);
      expect(metadata).to.have.property('mimeType', file.mimeType);
      expect(metadata).to.have.property('size', file.content.length);
      expect(metadata).to.have.property('encryptedAt');
      expect(metadata).to.have.property('version', 1);
      
      expect(metadata.id).to.be.a('string');
      expect(metadata.id).to.match(/^file_\d+_[a-z0-9]+$/);
      expect(metadata.encryptedAt).to.be.a('string');
      
      // Verify timestamp is recent (within last 10 seconds)
      const encryptedTime = new Date(metadata.encryptedAt);
      const now = new Date();
      const timeDiff = now - encryptedTime;
      expect(timeDiff).to.be.below(10000);
    });

    it('should format file sizes correctly', () => {
      const testCases = [
        { bytes: 0, expected: '0 Bytes' },
        { bytes: 512, expected: '512 Bytes' },
        { bytes: 1024, expected: '1 KB' },
        { bytes: 1536, expected: '1.5 KB' },
        { bytes: 1048576, expected: '1 MB' },
        { bytes: 1073741824, expected: '1 GB' }
      ];

      testCases.forEach(({ bytes, expected }) => {
        expect(fileEncryption.formatFileSize(bytes)).to.equal(expected);
      });
    });

    it('should extract file extensions correctly', () => {
      const testCases = [
        { filename: 'test.txt', expected: '.txt' },
        { filename: 'document.PDF', expected: '.pdf' },
        { filename: 'archive.tar.gz', expected: '.gz' },
        { filename: 'noextension', expected: '' },
        { filename: '.hidden', expected: '' },
        { filename: 'multiple.dots.file.jpg', expected: '.jpg' }
      ];

      testCases.forEach(({ filename, expected }) => {
        expect(fileEncryption.getFileExtension(filename)).to.equal(expected);
      });
    });
  });

  describe('Service Initialization', () => {
    it('should initialize properly', async () => {
      const freshService = new (await import('../src/lib/crypto/file-encryption.js')).FileEncryptionService();
      
      expect(freshService.isReady()).to.be.false;
      
      await freshService.initialize();
      
      expect(freshService.isReady()).to.be.true;
    });

    it('should handle multiple initialization calls', async () => {
      await fileEncryption.initialize();
      await fileEncryption.initialize(); // Should not throw
      
      expect(fileEncryption.isReady()).to.be.true;
    });
  });

  describe('Cross-Conversation Security', () => {
    it('should not decrypt files encrypted for different conversations', async () => {
      const file = testFiles.textFile;
      const conversation1 = 'conv-1';
      const conversation2 = 'conv-2';
      
      // Encrypt for conversation 1
      const encrypted = await fileEncryption.encryptFile(
        conversation1,
        file.content,
        file.name,
        file.mimeType
      );

      // Try to decrypt with conversation 2 key
      const decrypted = await fileEncryption.decryptFile(
        conversation2,
        encrypted.encryptedData,
        encrypted.metadata
      );

      // Should not equal original content due to different conversation keys
      expect(decrypted.fileContent).to.not.deep.equal(file.content);
    });
  });
});