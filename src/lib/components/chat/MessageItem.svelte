<script>
	import { user } from '$lib/stores/auth.js';
	import { convertUrlsToLinks } from '$lib/utils/url-link-converter.js';
	import { onMount } from 'svelte';

	let {
		message,
		isOwn = false,
		showAvatar = true,
		showTimestamp = true
	} = $props();

	const currentUser = $derived($user);
	
	// Use the already-decrypted content from WebSocket store
	const decryptedContent = $derived(message.content || '');
	
	// Convert URLs to clickable links
	const contentWithLinks = $derived(convertUrlsToLinks(decryptedContent));
	
	// File attachment state
	let files = $state(/** @type {any[]} */ ([]));
	let isLoadingFiles = $state(false);
	let fileLoadError = $state('');

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
		if (!message.has_files || files.length > 0 || isLoadingFiles) {
			return;
		}

		isLoadingFiles = true;
		fileLoadError = '';

		try {
			console.log(`📁 Loading files for message: ${message.id}`);

			const response = await fetch(`/api/files/message/${message.id}`, {
				method: 'GET',
				credentials: 'include'
			});

			if (!response.ok) {
				throw new Error(`Failed to load files: ${response.status}`);
			}

			const data = await response.json();
			files = data.files || [];
			
			console.log(`📁 Loaded ${files.length} files for message: ${message.id}`);

		} catch (error) {
			console.error(`📁 Error loading files for message ${message.id}:`, error);
			fileLoadError = error instanceof Error ? error.message : 'Failed to load files';
		} finally {
			isLoadingFiles = false;
		}
	}

	async function downloadFile(/** @type {any} */ file) {
		try {
			console.log(`📁 Downloading file: ${file.originalFilename}`);

			const response = await fetch(`/api/files/${file.id}`, {
				method: 'GET',
				credentials: 'include'
			});

			if (!response.ok) {
				throw new Error(`Failed to download file: ${response.status}`);
			}

			// Create download link
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = file.originalFilename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(url);

			console.log(`📁 ✅ Downloaded file: ${file.originalFilename}`);

		} catch (error) {
			console.error(`📁 Error downloading file:`, error);
			// Could show a toast or error message here
		}
	}

	// Load files when message has attachments
	$effect(() => {
		if (message.has_files && files.length === 0) {
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
			{#if message.has_files}
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
							<div class="file-attachment" onclick={() => downloadFile(file)}>
								<div class="file-info">
									<div class="file-icon">
										{getFileIcon(file.mimeType)}
									</div>
									<div class="file-details">
										<div class="file-name">{file.originalFilename}</div>
										<div class="file-size">{formatFileSize(file.fileSize)}</div>
									</div>
								</div>
								<div class="download-icon">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
										<path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
									</svg>
								</div>
							</div>
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
</style>