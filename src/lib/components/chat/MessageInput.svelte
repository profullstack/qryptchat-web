<script>
	import { onMount } from 'svelte';
	import { wsChat, activeConversation } from '$lib/stores/websocket-chat.js';
	import { user } from '$lib/stores/auth.js';
	import { publicKeyService } from '$lib/crypto/public-key-service.js';
	import { multiRecipientEncryption } from '$lib/crypto/multi-recipient-encryption.js';

	let { conversationId = null, disabled = false } = $props();

	let messageText = $state('');
	let textareaElement = $state(/** @type {HTMLTextAreaElement | null} */ (null));
	let fileInputElement = $state(/** @type {HTMLInputElement | null} */ (null));
	let isSending = $state(false);
	let isUploadingFiles = $state(false);
	let typingTimeout = $state(/** @type {NodeJS.Timeout | null} */ (null));
	let encryptionError = $state('');
	let showEncryptionError = $state(false);
	let selectedFiles = $state(/** @type {File[]} */ ([]));
	let uploadError = $state('');

	const currentUser = $derived($user);

	// Auto-resize textarea
	$effect(() => {
		if (textareaElement && messageText !== undefined) {
			textareaElement.style.height = 'auto';
			textareaElement.style.height = Math.min(textareaElement.scrollHeight, 120) + 'px';
		}
	});

	function handleKeyDown(/** @type {KeyboardEvent} */ event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleInput() {
		// Handle typing indicators
		if (conversationId && currentUser?.id) {
			// Clear existing timeout
			if (typingTimeout) {
				clearTimeout(typingTimeout);
			}

			// Set typing indicator
			wsChat.setTyping(conversationId);

			// Clear typing indicator after 3 seconds of inactivity
			typingTimeout = setTimeout(() => {
				if (conversationId && currentUser?.id) {
					wsChat.stopTyping(conversationId);
				}
			}, 3000);
		}
	}

	function handlePaste(/** @type {ClipboardEvent} */ event) {
		const items = event.clipboardData?.items;
		if (items) {
			for (const item of items) {
				if (item.type.startsWith('image/')) {
					event.preventDefault();
					const file = item.getAsFile();
					if (file) {
						handleFileSelection([file]);
					}
					break;
				}
			}
		}
	}

	function handleAttachClick() {
		if (fileInputElement && !disabled && !isUploadingFiles) {
			fileInputElement.click();
		}
	}

	function handleFileInput(/** @type {Event} */ event) {
		const input = /** @type {HTMLInputElement} */ (event.target);
		const files = Array.from(input.files || []);
		if (files.length > 0) {
			handleFileSelection(files);
		}
		// Clear the input so same file can be selected again
		input.value = '';
	}

	function handleFileSelection(/** @type {File[]} */ files) {
		uploadError = '';
		
		// File validation utilities
		const maxFileSize = 50 * 1024 * 1024; // 50MB
		const allowedExtensions = [
			'.txt', '.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif',
			'.mp3', '.wav', '.mp4', '.webm', '.zip', '.rar'
		];
		const blockedExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js'];
		
		const getFileExtension = (filename) => {
			const lastDot = filename.lastIndexOf('.');
			return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
		};
		
		const isAllowedFileType = (filename) => {
			const extension = getFileExtension(filename);
			return !blockedExtensions.includes(extension) &&
				   (!extension || allowedExtensions.includes(extension));
		};
		
		// Validate files
		const validFiles = [];
		for (const file of files) {
			if (!isAllowedFileType(file.name)) {
				uploadError = `File type not allowed: ${getFileExtension(file.name)}`;
				return;
			}
			if (file.size > maxFileSize) {
				uploadError = `File too large. Maximum size is ${Math.floor(maxFileSize / (1024 * 1024))}MB`;
				return;
			}
			if (file.size === 0) {
				uploadError = 'File cannot be empty';
				return;
			}
			validFiles.push(file);
		}
		
		selectedFiles = validFiles;
		console.log(`📁 Selected ${selectedFiles.length} files for upload`);
	}

	function removeSelectedFile(/** @type {number} */ index) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	function formatFileSize(/** @type {number} */ bytes) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	async function sendMessage() {
		if (!conversationId || !currentUser?.id || isSending || isUploadingFiles) return;

		const content = messageText.trim();
		const hasText = content.length > 0;
		const hasFiles = selectedFiles.length > 0;

		if (!hasText && !hasFiles) return;

		isSending = true;
		isUploadingFiles = hasFiles;
		uploadError = '';

		try {
			if (hasFiles) {
				// First send a message to get the message ID
				const messageResult = await wsChat.sendMessage(
					conversationId,
					content || '[File attachment]',
					'file'
				);

				if (!messageResult?.success || !messageResult?.data?.id) {
					throw new Error('Failed to create message for file attachment');
				}

				const messageId = messageResult.data.id;
				console.log(`📁 Created message ${messageId} for file uploads`);

				// Encrypt and upload each file
				const uploadPromises = selectedFiles.map(async (file) => {
					// Read file content
					const arrayBuffer = await file.arrayBuffer();
					const uint8Array = new Uint8Array(arrayBuffer);
					
					// Convert to base64 using browser-compatible method
					let binary = '';
					for (let i = 0; i < uint8Array.length; i++) {
						binary += String.fromCharCode(uint8Array[i]);
					}
					const fileContent = btoa(binary);

					// Encrypt file using multi-recipient encryption (client-side)
					await multiRecipientEncryption.initialize();
					const encryptedContents = await multiRecipientEncryption.encryptForConversation(conversationId, fileContent);

					// Send encrypted data to server
					const formData = new FormData();
					formData.append('encryptedContents', JSON.stringify(encryptedContents));
					formData.append('originalFilename', file.name);
					formData.append('mimeType', file.type);
					formData.append('fileSize', file.size.toString());
					formData.append('conversationId', conversationId);
					formData.append('messageId', messageId);

					const response = await fetch('/api/files/upload', {
						method: 'POST',
						body: formData
					});

					if (!response.ok) {
						const errorData = await response.json().catch(() => ({}));
						throw new Error(errorData.message || `Failed to upload ${file.name}`);
					}

					return response.json();
				});

				await Promise.all(uploadPromises);
				console.log(`📁 ✅ Successfully uploaded ${selectedFiles.length} files`);

				// Update the message to set has_attachments=true (the database trigger should handle this automatically)
				// Force refresh the conversation to show updated message with attachments
				try {
					await wsChat.loadMessages(conversationId);
					console.log(`📁 ✅ Refreshed messages to show file attachments`);
				} catch (refreshError) {
					console.error(`📁 ⚠️ Failed to refresh messages:`, refreshError);
				}
				
				// Clear selected files after successful upload
				selectedFiles = [];
				messageText = '';
			} else {
				// Send text-only message
				const result = await wsChat.sendMessage(conversationId, content, 'text');
				if (result && !result.success) {
					throw new Error(result.error || 'Failed to send message');
				}
				messageText = '';
			}

		} catch (error) {
			console.error('📁 ❌ Error sending message:', error);
			const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
			uploadError = errorMessage;
			
			// Restore message text on failure
			if (!messageText.trim()) {
				messageText = content;
			}
		} finally {
			isSending = false;
			isUploadingFiles = false;
			
			// Focus back to textarea
			if (textareaElement) {
				textareaElement.focus();
			}
		}
	}

	onMount(() => {
		// Focus textarea on mount
		if (textareaElement) {
			textareaElement.focus();
		}

		// Cleanup typing indicator on unmount
		return () => {
			if (typingTimeout) {
				clearTimeout(typingTimeout);
			}
			if (conversationId && currentUser?.id) {
				wsChat.stopTyping(conversationId);
			}
		};
	});
</script>

<!-- Hidden file input -->
<input
	bind:this={fileInputElement}
	type="file"
	multiple
	accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
	style="display: none;"
	onchange={handleFileInput}
/>

<div class="message-input-container">
	<!-- File upload errors -->
	{#if uploadError}
		<div class="upload-error">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 2L2 7V10C2 16 6 20.5 12 22C18 20.5 22 16 22 10V7L12 2M12 7C12.5 7 13 7.5 13 8V12C13 12.5 12.5 13 12 13C11.5 13 11 12.5 11 8V12C11 11.5 11.5 11 12 11C12.5 11 13 11.5 13 12V8C13 7.5 12.5 7 12 7M12 17C11.2 17 10.5 16.3 10.5 15.5C10.5 14.7 11.2 14 12 14C12.8 14 13.5 14.7 13.5 15.5C13.5 16.3 12.8 17 12 17Z"/>
			</svg>
			{uploadError}
		</div>
	{/if}

	<!-- Selected files preview -->
	{#if selectedFiles.length > 0}
		<div class="selected-files">
			<div class="files-ready-indicator">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
				</svg>
				<span>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} ready to send</span>
			</div>
			{#each selectedFiles as file, index}
				<div class="file-preview" class:uploading={isUploadingFiles}>
					<div class="file-info">
						{#if isUploadingFiles}
							<div class="file-upload-spinner"></div>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
							</svg>
						{/if}
						<span class="file-name">{file.name}</span>
						<span class="file-size">({formatFileSize(file.size)})</span>
						{#if isUploadingFiles}
							<span class="upload-status">Encrypting & uploading...</span>
						{/if}
					</div>
					{#if !isUploadingFiles}
						<button
							type="button"
							class="remove-file-btn"
							onclick={() => removeSelectedFile(index)}
							title="Remove file"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
								<path d="M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 13.41,12 19,6.41Z"/>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="message-input">
		<div class="input-wrapper">
			<textarea
				bind:this={textareaElement}
				bind:value={messageText}
				placeholder={disabled ? 'Select a conversation to start messaging' : 'Type a message...'}
				disabled={disabled || isUploadingFiles}
				rows="1"
				onkeydown={handleKeyDown}
				oninput={handleInput}
				onpaste={handlePaste}
			></textarea>
			
			<div class="input-actions">
				<button
					type="button"
					class="attach-button"
					class:uploading={isUploadingFiles}
					disabled={disabled || isUploadingFiles}
					title="Attach file"
					aria-label="Attach file"
					onclick={handleAttachClick}
				>
					{#if isUploadingFiles}
						<div class="uploading-spinner"></div>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
						</svg>
					{/if}
				</button>
				
				<button
					type="button"
					class="send-button"
					class:sending={isSending}
					disabled={disabled || (!messageText.trim() && selectedFiles.length === 0) || isSending || isUploadingFiles}
					onclick={sendMessage}
					title="Send message"
				>
					{#if isSending}
						<div class="sending-spinner"></div>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.message-input-container {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.upload-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-error-background, #fee);
		color: var(--color-error-text, #c53030);
		border: 1px solid var(--color-error-border, #fed7d7);
		border-radius: 0.5rem;
		padding: 0.75rem;
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.selected-files {
		margin-bottom: 1rem;
	}

	.files-ready-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--color-success-background, #f0fdf4);
		color: var(--color-success-text, #166534);
		border: 1px solid var(--color-success-border, #bbf7d0);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.file-preview {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		transition: all 0.2s ease;
	}

	.file-preview.uploading {
		background: var(--color-primary-50, #f0f9ff);
		border-color: var(--color-primary-200, #bfdbfe);
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		color: var(--color-text-primary);
	}

	.file-name {
		font-weight: 500;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		color: var(--color-text-secondary);
		font-size: 0.8rem;
	}

	.upload-status {
		color: var(--color-primary-600, #2563eb);
		font-size: 0.8rem;
		font-weight: 500;
		margin-left: 0.5rem;
	}

	.file-upload-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--color-primary-200, #bfdbfe);
		border-top: 2px solid var(--color-primary-500, #3b82f6);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.remove-file-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.remove-file-btn:hover {
		background: var(--color-error-background, #fee);
		color: var(--color-error-text, #c53030);
	}

	.message-input {
		max-width: 100%;
	}

	.input-wrapper {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 1.5rem;
		padding: 0.75rem 1rem;
		transition: border-color 0.2s ease;
	}

	.input-wrapper:focus-within {
		border-color: var(--color-primary-500);
	}

	textarea {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		line-height: 1.4;
		resize: none;
		min-height: 20px;
		max-height: 120px;
		font-family: inherit;
	}

	textarea::placeholder {
		color: var(--color-text-secondary);
	}

	textarea:disabled {
		color: var(--color-text-secondary);
		cursor: not-allowed;
	}

	.input-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.attach-button,
	.send-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		background: transparent;
		color: var(--color-text-secondary);
	}

	.attach-button:hover:not(:disabled) {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.attach-button.uploading {
		background: var(--color-primary-100);
		color: var(--color-primary-500);
	}

	.send-button {
		background: var(--color-primary-500);
		color: white;
	}

	.send-button:hover:not(:disabled) {
		background: var(--color-primary-600);
		transform: scale(1.05);
	}

	.send-button:disabled {
		background: var(--color-border);
		color: var(--color-text-secondary);
		cursor: not-allowed;
		transform: none;
	}

	.send-button.sending {
		background: var(--color-primary-400);
		cursor: not-allowed;
	}

	.sending-spinner,
	.uploading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.uploading-spinner {
		border: 2px solid rgba(var(--color-primary-500), 0.3);
		border-top: 2px solid var(--color-primary-500);
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.message-input-container {
			padding: 0.75rem;
		}

		.input-wrapper {
			padding: 0.625rem 0.875rem;
		}

		.attach-button,
		.send-button {
			width: 32px;
			height: 32px;
		}

		textarea {
			font-size: 16px; /* Prevent zoom on iOS */
		}

		.file-name {
			max-width: 150px;
		}
	}
</style>