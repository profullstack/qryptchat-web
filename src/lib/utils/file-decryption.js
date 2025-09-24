/**
 * @fileoverview Utility functions for client-side file decryption
 * Shared logic for decrypting files and extracting metadata
 */

/**
 * Decrypt file content and extract metadata
 * @param {string} fileId - File ID
 * @returns {Promise<{content: string, filename: string, metadata: object}>}
 */
export async function decryptFileContent(fileId) {
	// Get encrypted file data
	const response = await fetch(`/api/files/${fileId}/encrypted`, {
		method: 'GET',
		credentials: 'include'
	});

	if (!response.ok) {
		throw new Error(`Failed to load encrypted file: ${response.status}`);
	}

	const encryptedData = await response.json();

	// Import encryption services
	const { postQuantumEncryption } = await import('$lib/crypto/post-quantum-encryption.js');
	await postQuantumEncryption.initialize();

	// Parse encrypted contents
	const encryptedContents = JSON.parse(encryptedData.file.encryptedContents);

	// Get current user from WebSocket store
	const { currentUser: wsUser } = await import('$lib/stores/websocket-chat.js');
	let user = null;
	const unsubscribe = wsUser.subscribe((u) => user = u);
	unsubscribe();
	
	if (!user?.id) {
		throw new Error('User not authenticated');
	}
	
	// Try to find user's encrypted copy
	const userEncryptedCopy = encryptedContents[user.id];
	
	if (!userEncryptedCopy) {
		throw new Error(`No encrypted copy found for user: ${user.id}`);
	}

	// Decrypt the file content
	const decryptedContent = await postQuantumEncryption.decryptFromSender(
		userEncryptedCopy,
		''
	);

	// Parse the decrypted content to extract file metadata and content
	let fileMetadata;
	let actualFileContent;
	let extractedFilename;
	
	try {
		// Try to parse as JSON (new format with metadata)
		fileMetadata = JSON.parse(decryptedContent);
		if (fileMetadata.content && fileMetadata.filename) {
			actualFileContent = fileMetadata.content;
			extractedFilename = fileMetadata.filename;
		} else {
			throw new Error('Invalid metadata format');
		}
	} catch (parseError) {
		// Fallback to treating entire content as base64 file content (legacy format)
		actualFileContent = decryptedContent;
		extractedFilename = 'encrypted-file';
	}

	return {
		content: actualFileContent,
		filename: extractedFilename,
		metadata: fileMetadata || {}
	};
}

/**
 * Decrypt and download a file
 * @param {object} file - File object with id and mimeType
 */
export async function downloadDecryptedFile(file) {
	const { content, filename } = await decryptFileContent(file.id);

	// Convert base64 to binary
	const binaryString = atob(content);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// Create blob and download
	const blob = new Blob([bytes], { type: file.mimeType });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.URL.revokeObjectURL(url);

	return filename;
}

/**
 * Decrypt file and create media URL for preview
 * @param {object} file - File object with id and mimeType
 * @returns {Promise<{url: string, filename: string}>}
 */
export async function createDecryptedMediaUrl(file) {
	const { content, filename } = await decryptFileContent(file.id);

	// Convert base64 to binary
	const binaryString = atob(content);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}

	// Create blob with proper MIME type
	const blob = new Blob([bytes], { type: file.mimeType });
	const mediaUrl = window.URL.createObjectURL(blob);

	return { url: mediaUrl, filename };
}