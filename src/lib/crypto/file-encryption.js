/**
 * @fileoverview File encryption service for QryptChat
 * Encrypts files using the same post-quantum encryption as messages
 */

import { clientEncryption } from './client-encryption.js';
import { Base64 } from './index.js';

/**
 * File encryption service using post-quantum encryption
 */
export class FileEncryptionService {
	constructor() {
		this.maxFileSize = 2147483648; // 2GB max file size
		this.allowedExtensions = [
			// Documents
			'.txt', '.pdf', '.doc', '.docx', '.rtf', '.odt',
			// Images
			'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
			// Audio
			'.mp3', '.wav', '.ogg', '.m4a', '.flac',
			// Video
			'.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv',
			// Archives
			'.zip', '.rar', '.7z', '.tar', '.gz',
			// Spreadsheets
			'.xls', '.xlsx', '.ods', '.csv',
			// Presentations  
			'.ppt', '.pptx', '.odp'
		];
		
		this.blockedExtensions = [
			'.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.vbs', '.js', '.jar'
		];
	}

	/**
	 * Initialize the file encryption service
	 */
	async initialize() {
		await clientEncryption.initialize();
	}

	/**
	 * Encrypt a file for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @param {Uint8Array} fileContent - File content as bytes
	 * @param {string} originalName - Original filename
	 * @param {string} mimeType - MIME type of file
	 * @returns {Promise<{encryptedData: string, metadata: object}>} Encrypted file data and metadata
	 */
	async encryptFile(conversationId, fileContent, originalName, mimeType) {
		try {
			// Validate inputs
			if (!fileContent || fileContent.length === 0) {
				throw new Error('File content cannot be empty');
			}

			if (!this.isValidFileSize(fileContent.length)) {
				throw new Error(`File size exceeds maximum limit of ${Math.floor(this.maxFileSize / (1024 * 1024))}MB`);
			}

			if (!this.isAllowedFileType(originalName)) {
				throw new Error(`File type not allowed: ${this.getFileExtension(originalName)}`);
			}

			console.log(`🔐 [FILE-ENCRYPT] Encrypting file: ${originalName} (${fileContent.length} bytes)`);

			// Convert file content to base64 for encryption
			const base64Content = Base64.encode(fileContent);

			// Use the existing client encryption service
			const encryptedContent = await clientEncryption.encryptMessage(conversationId, base64Content);

			// Create file metadata
			const fileId = this.generateFileId();
			const metadata = {
				id: fileId,
				originalName,
				mimeType,
				size: fileContent.length,
				encryptedAt: new Date().toISOString(),
				version: 1
			};

			console.log(`🔐 [FILE-ENCRYPT] ✅ Successfully encrypted file: ${originalName}`);

			return {
				encryptedData: encryptedContent,
				metadata
			};

		} catch (error) {
			console.error(`🔐 [FILE-ENCRYPT] ❌ Failed to encrypt file: ${originalName}`, error);
			throw error;
		}
	}

	/**
	 * Decrypt a file for a conversation
	 * @param {string} conversationId - Conversation ID
	 * @param {string} encryptedData - Encrypted file data
	 * @param {object} metadata - File metadata
	 * @returns {Promise<{fileContent: Uint8Array, metadata: object}>} Decrypted file content and metadata
	 */
	async decryptFile(conversationId, encryptedData, metadata) {
		try {
			console.log(`🔐 [FILE-DECRYPT] Decrypting file: ${metadata.originalName}`);

			// Use the existing client encryption service to decrypt
			const base64Content = await clientEncryption.decryptMessage(conversationId, encryptedData);

			// Convert base64 back to bytes
			const fileContent = Base64.decode(base64Content);

			console.log(`🔐 [FILE-DECRYPT] ✅ Successfully decrypted file: ${metadata.originalName} (${fileContent.length} bytes)`);

			return {
				fileContent,
				metadata
			};

		} catch (error) {
			console.error(`🔐 [FILE-DECRYPT] ❌ Failed to decrypt file: ${metadata.originalName}`, error);
			throw error;
		}
	}

	/**
	 * Check if file type is allowed
	 * @param {string} filename - Filename to check
	 * @returns {boolean} Whether file type is allowed
	 */
	isAllowedFileType(filename) {
		if (!filename) return false;

		const extension = this.getFileExtension(filename).toLowerCase();
		
		// Check if explicitly blocked
		if (this.blockedExtensions.includes(extension)) {
			return false;
		}

		// Check if in allowed list (or allow if no extension)
		return !extension || this.allowedExtensions.includes(extension);
	}

	/**
	 * Check if file size is within limits
	 * @param {number} size - File size in bytes
	 * @returns {boolean} Whether file size is valid
	 */
	isValidFileSize(size) {
		return size > 0 && size <= this.maxFileSize;
	}

	/**
	 * Get file extension from filename
	 * @param {string} filename - Filename
	 * @returns {string} File extension (with dot)
	 */
	getFileExtension(filename) {
		if (!filename) return '';
		const lastDot = filename.lastIndexOf('.');
		return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
	}

	/**
	 * Generate unique file ID
	 * @returns {string} Unique file ID
	 */
	generateFileId() {
		return `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
	}

	/**
	 * Get human readable file size
	 * @param {number} bytes - File size in bytes
	 * @returns {string} Human readable size
	 */
	formatFileSize(bytes) {
		if (bytes === 0) return '0 Bytes';
		
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	/**
	 * Check if service is ready
	 * @returns {boolean} Whether service is initialized
	 */
	isReady() {
		return clientEncryption.isReady();
	}
}

// Create and export singleton instance
export const fileEncryption = new FileEncryptionService();