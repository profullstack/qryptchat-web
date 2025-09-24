<script>
 	import { user } from '$lib/stores/auth.js';
 	import { convertUrlsToLinks } from '$lib/utils/url-link-converter.js';
 	import { decryptFileContent, downloadDecryptedFile, createDecryptedMediaUrl } from '$lib/utils/file-decryption.js';
 	import { onMount } from 'svelte';
 
 	let {
 		message,
 		isOwn = false,
 		showAvatar = true,
 		showTimestamp = true
 	} = $props();
 
 	const currentUser = $derived(/** @type {any} */ ($user));
 	
 	// Use the already-decrypted content from WebSocket store
 	const decryptedContent = $derived(message.content || '');
 	
 	// Convert URLs to clickable links
 	const contentWithLinks = $derived(convertUrlsToLinks(decryptedContent));
 	
 	// File attachment state
 	let files = $state(/** @type {any[]} */ ([]));
 	let isLoadingFiles = $state(false);
 	let fileLoadError = $state('');
 	let decryptedFilenames = $state(/** @type {Map<string, string>} */ (new Map()));

  // Track expanded/collapsed state for text previews
  let expandedFiles = $state(new Set());

  function toggleExpand(/** @type {string} */ fileId) {
    if (expandedFiles.has(fileId)) {
      expandedFiles.delete(fileId);
    } else {
      expandedFiles.add(fileId);
    }
    expandedFiles = new Set(expandedFiles);
  }
 
 	function formatTime(/** @type {string} */ timestamp) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function getAvatarUrl(/** @type {any} */ sender) {
		return sender?.avatar_url || null;
	}

	function getDisplayName(/** @type {any} */ sender) {
		return sender?.display_name || sender?.username || 'Unknown User';
	}

	function getInitials(/** @type {string} */ name) {
		return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
	}

	function getFileIcon(/** @type {string} */ mimeType) {
		if (mimeType.startsWith('image/')) {
			return '🖼️';
		} else if (mimeType.startsWith('video/')) {
			return '🎥';
		} else if (mimeType.startsWith('audio/')) {
			return '🎵';
		} else if (mimeType.includes('pdf')) {
			return '📄';
		} else if (mimeType.includes('document') || mimeType.includes('word')) {
			return '📝';
		} else if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
			return '📊';
		} else if (mimeType.includes('zip') || mimeType.includes('rar')) {
			return '🗂️';
		}
		return '📎';
	}

	function formatFileSize(/** @type {number} */ bytes) {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	async function loadFiles() {
		if (!message.has_attachments || files.length > 0 || isLoadingFiles) {
			console.log(`📁 [LOAD-FILES] Skipping load - has_attachments: ${message.has_attachments}, files.length: ${files.length}, isLoadingFiles: ${isLoadingFiles}`);
			return;
		}

		isLoadingFiles = true;
		fileLoadError = '';

		try {
			console.log(`📁 [LOAD-FILES] Loading files for message: ${message.id}`);

			const response = await fetch(`/api/files/message/${message.id}`, {
				method: 'GET',
				credentials: 'include'
			});

			console.log(`📁 [LOAD-FILES] API response status: ${response.status}`);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`📁 [LOAD-FILES] API error: ${response.status} - ${errorText}`);
				throw new Error(`Failed to load files: ${response.status} - ${errorText}`);
			}

			const data = await response.json();
			console.log(`📁 [LOAD-FILES] API response data:`, data);
			
			files = data.files || [];
			
			// Decrypt all filenames upfront before rendering
			console.log(`📁 [LOAD-FILES] Decrypting filenames for ${files.length} files...`);
			for (const file of files) {
				await decryptFilename(file);
			}
			
			console.log(`📁 [LOAD-FILES] ✅ Loaded and decrypted ${files.length} files for message: ${message.id}`);

		} catch (error) {
			console.error(`📁 [LOAD-FILES] ❌ Error loading files for message ${message.id}:`, error);
			fileLoadError = error instanceof Error ? error.message : 'Failed to load files';
		} finally {
			isLoadingFiles = false;
		}
	}

	async function decryptFilename(/** @type {any} */ file) {
		try {
			console.log(`📁 [DECRYPT-FILENAME] Decrypting filename for file: ${file.id}`);
			const { filename } = await decryptFileContent(file.id);
			decryptedFilenames.set(file.id, filename);
			console.log(`📁 [DECRYPT-FILENAME] ✅ Updated display filename for ${file.id}: ${filename}`);
		} catch (error) {
			console.error(`📁 [DECRYPT-FILENAME] ❌ Error decrypting filename:`, error);
		}
	}

	async function downloadFile(/** @type {any} */ file) {
		try {
			console.log(`📁 [DOWNLOAD] Starting download for: ${file.originalFilename}`);
			const filename = await downloadDecryptedFile(file);
			console.log(`📁 [DOWNLOAD] ✅ File downloaded: ${filename}`);
		} catch (error) {
			console.error(`📁 [DOWNLOAD] ❌ Error downloading file:`, error);
		}
	}

	async function getMediaUrl(/** @type {any} */ file) {
		try {
			console.log(`📁 [MEDIA] Loading media for file: ${file.id}`);
			const { url, filename } = await createDecryptedMediaUrl(file);
			
			// Update the decrypted filenames map
			decryptedFilenames.set(file.id, filename);
			console.log(`📁 [MEDIA] ✅ Media URL created: ${filename}`);
			
			return url;
		} catch (error) {
			console.error(`📁 [MEDIA] ❌ Error loading media:`, error);
			return null;
		}
	}

	// Load files when message has attachments
	$effect(() => {
		console.log(`📁 [DEBUG] MessageItem effect - Message ID: ${message.id}, has_attachments: ${message.has_attachments}, files.length: ${files.length}`);
		if (message.has_attachments && files.length === 0) {
			console.log(`📁 [DEBUG] Loading files for message: ${message.id}`);
			loadFiles();
		}
	});
</script>

<div class="message-item" class:own={isOwn}>
	{#if !isOwn}
		<a href="/u/{message.sender?.username}" class="message-avatar-link">
			<div class="message-avatar">
				{#if getAvatarUrl(message.sender)}
					<img src={getAvatarUrl(message.sender)} alt={getDisplayName(message.sender)} />
				{:else}
					<div class="avatar-placeholder">
						{getInitials(getDisplayName(message.sender))}
					</div>
				{/if}
			</div>
		</a>
	{/if}

	<div class="message-content" class:own-content={isOwn}>
		{#if !isOwn}
			<div class="message-header">
				<a href="/u/{message.sender?.username}" class="sender-name-link">
					<span class="sender-name">{getDisplayName(message.sender)}</span>
				</a>
				<span class="message-time">{formatTime(message.created_at)}</span>
			</div>
		{/if}

		<div class="message-bubble" class:own-bubble={isOwn}>
			<div class="message-text">
				{@html contentWithLinks}
			</div>
			
			<!-- File attachments -->
			{#if message.has_attachments}
				<div class="file-attachments">
					{#if isLoadingFiles}
						<div class="file-loading">
							<div class="loading-spinner"></div>
							<span>Loading files...</span>
						</div>
					{:else if fileLoadError}
						<div class="file-error">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2L2 7V10C2 16 6 20.5 12 22C18 20.5 22 16 22 10V7L12 2M12 7C12.5 7 13 7.5 13 8V12C13 12.5 12.5 13 12 13C11.5 13 11 12.5 11 8V12C11 11.5 11.5 11 12 11C12.5 11 13 11.5 13 12V8C13 7.5 12.5 7 12 7M12 17C11.2 17 10.5 16.3 10.5 15.5C10.5 14.7 11.2 14 12 14C12.8 14 13.5 14.7 13.5 15.5C13.5 16.3 12.8 17 12 17Z"/>
							</svg>
							Failed to load files
						</div>
					{:else}
						{#each files as file}
							{@const displayFilename = decryptedFilenames.get(file.id)}
							{#if file.mimeType?.startsWith('image/')}
								<!-- Inline image display -->
								<div class="media-attachment">
									<div class="media-header">
										<div class="media-info">
											<span class="media-icon">{getFileIcon(file.mimeType)}</span>
											<div class="media-details">
												<span class="media-filename">{displayFilename}</span>
												<span class="media-size">{formatFileSize(file.fileSize)}</span>
											</div>
										</div>
										<button class="download-btn" onclick={() => downloadFile(file)} title="Download" aria-label="Download file">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
												<path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
											</svg>
										</button>
									</div>
									{#await getMediaUrl(file)}
										<div class="media-loading">
											<div class="loading-spinner"></div>
											<span>Loading image...</span>
										</div>
									{:then mediaUrl}
										{#if mediaUrl}
											<button type="button" class="image-button" onclick={() => downloadFile(file)} aria-label="Download image">
												<img src={mediaUrl} alt={displayFilename} class="inline-image" />
											</button>
										{:else}
											<div class="media-error">Failed to load image</div>
										{/if}
									{:catch error}
										<div class="media-error">Error loading image</div>
									{/await}
								</div>
							{:else if file.mimeType?.startsWith('video/')}
								<!-- Inline video display -->
								<div class="media-attachment">
									<div class="media-header">
										<div class="media-info">
											<span class="media-icon">{getFileIcon(file.mimeType)}</span>
											<div class="media-details">
												<span class="media-filename">{file.originalFilename}</span>
												<span class="media-size">{formatFileSize(file.fileSize)}</span>
											</div>
										</div>
										<button class="download-btn" onclick={() => downloadFile(file)} title="Download" aria-label="Download file">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
												<path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
											</svg>
										</button>
									</div>
									{#await getMediaUrl(file)}
										<div class="media-loading">
											<div class="loading-spinner"></div>
											<span>Loading video...</span>
										</div>
									{:then mediaUrl}
										{#if mediaUrl}
											<video src={mediaUrl} controls class="inline-video">
												<track kind="captions" src="" srclang="en" label="English" default />
												Your browser does not support video playback.
											</video>
										{:else}
											<div class="media-error">Failed to load video</div>
										{/if}
									{:catch error}
										<div class="media-error">Error loading video</div>
									{/await}
								</div>
							{:else if file.mimeType?.startsWith('audio/')}
								<!-- Inline audio display -->
								<div class="media-attachment">
									<div class="media-header">
										<div class="media-info">
											<span class="media-icon">{getFileIcon(file.mimeType)}</span>
											<div class="media-details">
												<span class="media-filename">{file.originalFilename}</span>
												<span class="media-size">{formatFileSize(file.fileSize)}</span>
											</div>
										</div>
										<button class="download-btn" onclick={() => downloadFile(file)} title="Download" aria-label="Download file">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
												<path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
											</svg>
										</button>
									</div>
									{#await getMediaUrl(file)}
										<div class="media-loading">
											<div class="loading-spinner"></div>
											<span>Loading audio...</span>
										</div>
									{:then mediaUrl}
										{#if mediaUrl}
											<audio src={mediaUrl} controls class="inline-audio">
												Your browser does not support audio playback.
											</audio>
										{:else}
											<div class="media-error">Failed to load audio</div>
										{/if}
									{:catch error}
										<div class="media-error">Error loading audio</div>
									{/await}
								</div>
							{:else}
								<!-- Detect and preview text-based files -->
								{#if file.mimeType?.startsWith('text/') || file.originalFilename.match(/\.(json|txt|md|csv|log|js)$/i)}
									<div class="text-preview">
										<pre>
											{#if file.originalFilename.endsWith('.js')}
												{file.decryptedContent?.slice(0, 2000)}
												{file.decryptedContent && file.decryptedContent.length > 2000 ? "\n[JavaScript files are limited to snippet view]" : ""}
											{:else if expandedFiles?.has(file.id)}
												{file.decryptedContent}
											{:else}
												{file.decryptedContent?.slice(0, 2000)}
												{file.decryptedContent && file.decryptedContent.length > 2000 ? "\n... (read more below)" : ""}
											{/if}
										</pre>
										{#if !file.originalFilename.endsWith('.js') && file.decryptedContent && file.decryptedContent.length > 2000}
											<button class="read-more-btn" onclick={() => toggleExpand(file.id)}>
												{expandedFiles.has(file.id) ? "Show less" : "Read more"}
											</button>
										{/if}
									</div>
								{:else}
									<!-- Default download-only display for non-text files -->
									<button type="button" class="file-attachment" onclick={() => downloadFile(file)} aria-label="Download {file.originalFilename}">
										<div class="file-info">
											<div class="file-icon">
												{getFileIcon(file.mimeType)}
											</div>
											<div class="file-details">
												<div class="file-name">{decryptedFilenames.get(file.id)}</div>
												<div class="file-size">{formatFileSize(file.fileSize)}</div>
											</div>
										</div>
										<div class="download-icon">
											<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
												<path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
											</svg>
										</div>
									</button>
								{/if}
							{/if}
						{/each}
					{/if}
				</div>
			{/if}
			
			{#if isOwn && showTimestamp}
				<div class="message-time own-time">{formatTime(message.created_at)}</div>
			{/if}
		</div>
	</div>

	{#if isOwn}
		<a href="/u/{currentUser?.username}" class="message-avatar-link">
			<div class="message-avatar">
				{#if currentUser?.avatarUrl}
					<img src={currentUser.avatarUrl} alt={currentUser.displayName || currentUser.username} />
				{:else}
					<div class="avatar-placeholder">
						{getInitials(currentUser?.displayName || currentUser?.username || 'You')}
					</div>
				{/if}
			</div>
		</a>
	{/if}
</div>

<style>
	.message-item {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		padding: 0.25rem 0;
		width: 100%;
		align-items: flex-start;
	}

	.message-item.own {
		justify-content: flex-end;
		margin-left: auto;
		margin-right: 0;
		max-width: 80%;
	}

	.message-avatar-link {
		text-decoration: none;
		flex-shrink: 0;
		align-self: center;
		transition: opacity 0.2s ease;
	}

	.message-avatar-link:hover {
		opacity: 0.8;
	}

	.message-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		align-self: flex-end;
	}

	.message-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--brand-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.message-content {
		flex: 1;
		min-width: 0;
		max-width: 70%;
		overflow: hidden;
	}

	.message-content.own-content {
		max-width: 70%;
		align-self: flex-end;
		overflow: hidden;
	}

	.message-header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.sender-name-link {
		text-decoration: none;
		transition: opacity 0.2s ease;
	}

	.sender-name-link:hover {
		opacity: 0.8;
	}

	.sender-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.message-time {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.message-bubble {
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 1rem;
		padding: 0.75rem 1rem;
		position: relative;
		word-wrap: break-word;
		overflow-wrap: break-word;
		word-break: break-word;
		text-wrap: wrap;
		hyphens: auto;
		color: var(--text-primary);
		max-width: 100%;
		box-sizing: border-box;
	}

	.message-bubble.own-bubble {
		background: var(--brand-primary);
		color: white;
		border-color: var(--brand-primary);
	}

	.message-bubble.own-bubble .message-text {
		text-align: right;
	}
	
	.message-text {
		line-height: 1.4;
		font-size: 0.875rem;
	}

	.own-time {
		text-align: right;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		opacity: 0.8;
	}

	.message-bubble.own-bubble .own-time {
		color: rgba(255, 255, 255, 0.8);
	}

	.file-attachments {
		margin-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		padding-top: 0.75rem;
	}

	.message-bubble:not(.own-bubble) .file-attachments {
		border-top: 1px solid var(--color-border);
	}

	.file-loading,
	.file-error {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		font-size: 0.8rem;
		color: var(--color-text-secondary);
	}

	.file-error {
		color: var(--color-error-text, #c53030);
	}

	.loading-spinner {
		width: 12px;
		height: 12px;
		border: 2px solid rgba(var(--color-text-secondary), 0.3);
		border-top: 2px solid var(--color-text-secondary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.file-attachment {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-bottom: 0.5rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.message-bubble:not(.own-bubble) .file-attachment {
		background: var(--color-surface-hover);
		border: 1px solid var(--color-border);
	}

	.file-attachment:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.message-bubble:not(.own-bubble) .file-attachment:hover {
		background: var(--color-background);
	}

	.file-attachment:last-child {
		margin-bottom: 0;
	}

	.file-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.file-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.file-details {
		flex: 1;
		min-width: 0;
	}

	.file-name {
		font-weight: 500;
		font-size: 0.8rem;
		line-height: 1.2;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.file-size {
		font-size: 0.7rem;
		opacity: 0.8;
		line-height: 1.2;
	}

	.download-icon {
		flex-shrink: 0;
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.file-attachment:hover .download-icon {
		opacity: 1;
	}

	/* Removed unused CSS selectors for cleaner build */

	.media-attachment {
		margin-bottom: 0.75rem;
		border-radius: 0.75rem;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.message-bubble:not(.own-bubble) .media-attachment {
		background: var(--color-background);
		border: 1px solid var(--color-border);
	}

	.media-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		background: rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.message-bubble:not(.own-bubble) .media-header {
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.media-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.media-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.media-details {
		flex: 1;
		min-width: 0;
	}

	.media-filename {
		font-weight: 500;
		font-size: 0.8rem;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}

	.media-size {
		font-size: 0.7rem;
		opacity: 0.7;
		display: block;
		margin-top: 0.125rem;
	}

	.download-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		color: inherit;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.download-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.1);
	}

	.image-button {
		border: none;
		background: transparent;
		padding: 0;
		cursor: pointer;
		display: block;
		width: 100%;
		transition: opacity 0.2s ease;
	}

	.image-button:hover {
		opacity: 0.9;
	}

	.inline-image {
		width: 100%;
		max-width: 400px;
		max-height: 300px;
		object-fit: cover;
		display: block;
	}

	.inline-video {
		width: 100%;
		max-width: 400px;
		max-height: 300px;
	}

	.inline-audio {
		width: 100%;
		max-width: 300px;
	}

	.media-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 2rem;
		font-size: 0.8rem;
		opacity: 0.7;
	}

	.media-error {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		font-size: 0.8rem;
		color: var(--color-error-text, #c53030);
		background: var(--color-error-background, #fee);
		border-radius: 0.5rem;
		margin: 0.5rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Removed message bubble tails to fix visual artifacts */

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.message-content,
		.message-content.own-content {
			max-width: 85%;
		}

		.message-avatar {
			width: 28px;
			height: 28px;
		}

		.message-bubble {
			padding: 0.625rem 0.875rem;
		}

		.message-text {
			font-size: 0.8125rem;
		}
	}
  .text-preview {
    margin-top: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 0.5rem;
    font-family: monospace;
    font-size: 0.85rem;
    white-space: pre-wrap;
    max-height: 400px;
    overflow: auto;
  }

  .read-more-btn {
    display: inline-block;
    margin-top: 0.5rem;
    background: var(--color-primary-500);
    color: white;
    border: none;
    border-radius: 4px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .read-more-btn:hover {
    background: var(--color-primary-600);
  }
</style>