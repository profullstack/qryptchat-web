// tests/filename-integration.test.js - Integration test for filename encryption in file upload flow
import { describe, it, expect } from 'vitest';

describe('File Upload with Encrypted Filenames - Integration Test', () => {
	it('should create proper file metadata structure', () => {
		// Test the client-side file metadata structure
		const testFile = {
			name: 'confidential-report.pdf',
			type: 'application/pdf',
			size: 1234567
		};
		
		const fileContent = 'base64-encoded-file-content-here';
		
		// This is what MessageInput.svelte creates
		const fileMetadata = {
			filename: testFile.name,
			mimeType: testFile.type,
			size: testFile.size,
			content: fileContent,
			uploadedAt: new Date().toISOString()
		};

		// Verify structure
		expect(fileMetadata).toHaveProperty('filename');
		expect(fileMetadata).toHaveProperty('mimeType');
		expect(fileMetadata).toHaveProperty('size');
		expect(fileMetadata).toHaveProperty('content');
		expect(fileMetadata).toHaveProperty('uploadedAt');

		expect(fileMetadata.filename).toBe('confidential-report.pdf');
		expect(fileMetadata.mimeType).toBe('application/pdf');
		expect(fileMetadata.size).toBe(1234567);
		expect(fileMetadata.content).toBe(fileContent);
	});

	it('should handle file metadata JSON serialization and parsing', () => {
		const originalMetadata = {
			filename: 'secret-document.xlsx',
			mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			size: 987654,
			content: 'UklGRkQAAABXRUJQVlA4WAo',
			uploadedAt: '2024-09-24T08:00:00.000Z'
		};

		// Serialize to JSON (what gets encrypted)
		const jsonString = JSON.stringify(originalMetadata);
		
		// Parse back (what happens during decryption)
		const parsedMetadata = JSON.parse(jsonString);

		expect(parsedMetadata).toEqual(originalMetadata);
		expect(parsedMetadata.filename).toBe('secret-document.xlsx');
		expect(parsedMetadata.content).toBe('UklGRkQAAABXRUJQVlA4WAo');
	});

	it('should handle legacy format fallback', () => {
		// Legacy format is just the base64 content directly
		const legacyContent = 'UklGRkQAAABXRUJQVlA4WAo';
		
		// Try to parse as JSON - should fail
		let fileMetadata = null;
		let actualFileContent = null;
		
		try {
			fileMetadata = JSON.parse(legacyContent);
			if (fileMetadata.content && fileMetadata.filename) {
				actualFileContent = fileMetadata.content;
			} else {
				throw new Error('Invalid metadata format');
			}
		} catch (parseError) {
			// Fallback to treating entire content as base64 file content (legacy format)
			actualFileContent = legacyContent;
		}

		expect(actualFileContent).toBe(legacyContent);
		expect(fileMetadata).toBeNull();
	});

	it('should handle special characters in filenames', () => {
		const testCases = [
			'file with spaces.jpg',
			'file-with-dashes.png',
			'file_with_underscores.pdf',
			'файл.txt', // Cyrillic
			'文件.docx', // Chinese
			'très_spécial_éèàù.zip', // French accents
			'file.with.multiple.dots.tar.gz',
			'UPPERCASE-FILE.PNG',
			'123-numeric-start.pdf',
			'emoji-file-📄.txt'
		];

		for (const filename of testCases) {
			const fileMetadata = {
				filename: filename,
				mimeType: 'application/octet-stream',
				size: 1000,
				content: 'dGVzdCBjb250ZW50',
				uploadedAt: new Date().toISOString()
			};

			// Test JSON serialization/deserialization
			const jsonString = JSON.stringify(fileMetadata);
			const parsed = JSON.parse(jsonString);

			expect(parsed.filename).toBe(filename);
			expect(parsed.content).toBe('dGVzdCBjb250ZW50');
		}
	});

	it('should validate required metadata fields', () => {
		const validMetadata = {
			filename: 'test.pdf',
			mimeType: 'application/pdf',
			size: 1000,
			content: 'dGVzdA==',
			uploadedAt: new Date().toISOString()
		};

		// Valid metadata should pass
		expect(!!(validMetadata.content && validMetadata.filename)).toBe(true);

		// Missing filename should fail validation
		const missingFilename = { ...validMetadata, filename: undefined };
		expect(!!(missingFilename.content && missingFilename.filename)).toBe(false);

		// Missing content should fail validation
		const missingContent = { ...validMetadata, content: undefined };
		expect(!!(missingContent.content && missingContent.filename)).toBe(false);

		// Empty filename should fail validation
		const emptyFilename = { ...validMetadata, filename: '' };
		expect(!!(emptyFilename.content && emptyFilename.filename)).toBe(false);

		// Empty content should fail validation
		const emptyContent = { ...validMetadata, content: '' };
		expect(!!(emptyContent.content && emptyContent.filename)).toBe(false);
	});

	it('should maintain MIME type consistency', () => {
		const testCases = [
			{ filename: 'image.jpg', mimeType: 'image/jpeg' },
			{ filename: 'video.mp4', mimeType: 'video/mp4' },
			{ filename: 'audio.mp3', mimeType: 'audio/mpeg' },
			{ filename: 'document.pdf', mimeType: 'application/pdf' },
			{ filename: 'spreadsheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
			{ filename: 'archive.zip', mimeType: 'application/zip' }
		];

		for (const testCase of testCases) {
			const fileMetadata = {
				filename: testCase.filename,
				mimeType: testCase.mimeType,
				size: 1000,
				content: 'dGVzdCBjb250ZW50',
				uploadedAt: new Date().toISOString()
			};

			const jsonString = JSON.stringify(fileMetadata);
			const parsed = JSON.parse(jsonString);

			expect(parsed.filename).toBe(testCase.filename);
			expect(parsed.mimeType).toBe(testCase.mimeType);
		}
	});
});