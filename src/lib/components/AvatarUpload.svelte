<script>
	import { createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	
	const dispatch = createEventDispatcher();
	
	export let userId = null; // Used for external reference
	export let currentAvatarUrl = null;
	export let size = 'large'; // 'small', 'medium', 'large'
	export let disabled = false;
	
	let fileInput;
	let uploading = false;
	let uploadProgress = 0;
	let previewUrl = currentAvatarUrl;
	let dragOver = false;
	
	// Size configurations
	const sizeConfig = {
		small: { width: 64, height: 64, text: 'text-sm' },
		medium: { width: 96, height: 96, text: 'text-base' },
		large: { width: 128, height: 128, text: 'text-lg' }
	};
	
	$: config = sizeConfig[size] || sizeConfig.large;
	
	// Handle file selection
	async function handleFileSelect(event) {
		const file = event.target.files?.[0];
		if (file) {
			await uploadAvatar(file);
		}
	}
	
	// Handle drag and drop
	function handleDragOver(event) {
		event.preventDefault();
		dragOver = true;
	}
	
	function handleDragLeave(event) {
		event.preventDefault();
		dragOver = false;
	}
	
	async function handleDrop(event) {
		event.preventDefault();
		dragOver = false;
		
		const files = event.dataTransfer.files;
		if (files.length > 0) {
			await uploadAvatar(files[0]);
		}
	}
	
	// Upload avatar via server-side API
	async function uploadAvatar(file) {
		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!allowedTypes.includes(file.type)) {
			dispatch('error', { message: 'Please select a valid image file (JPEG, PNG, WebP, or GIF)' });
			return;
		}
		
		// Validate file size (5MB limit)
		if (file.size > 5 * 1024 * 1024) {
			dispatch('error', { message: 'File size must be less than 5MB' });
			return;
		}
		
		try {
			uploading = true;
			uploadProgress = 0;
			
			// Create preview URL
			previewUrl = URL.createObjectURL(file);
			
			// Get JWT token for authentication
			const token = browser ? localStorage.getItem('supabase.auth.token') : null;
			if (!token) {
				throw new Error('Authentication token not found. Please log in again.');
			}

			const parsedToken = JSON.parse(token);
			const accessToken = parsedToken.access_token;

			// Create FormData for file upload
			const formData = new FormData();
			formData.append('avatar', file);
			
			// Upload via server-side API
			const response = await fetch('/api/auth/upload-avatar', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				},
				body: formData
			});
			
			const result = await response.json();
			
			if (!response.ok) {
				throw new Error(result.error || 'Failed to upload avatar');
			}
			
			// Clean up old preview URL
			if (previewUrl && previewUrl.startsWith('blob:')) {
				URL.revokeObjectURL(previewUrl);
			}
			
			previewUrl = result.avatarUrl;
			dispatch('uploaded', { avatarUrl: result.avatarUrl });
			
		} catch (error) {
			console.error('Avatar upload error:', error);
			dispatch('error', { message: error.message || 'Failed to upload avatar' });
			
			// Reset preview on error
			previewUrl = currentAvatarUrl;
		} finally {
			uploading = false;
			uploadProgress = 0;
		}
	}
	
	// Trigger file input
	function triggerFileInput() {
		if (!disabled && !uploading) {
			fileInput?.click();
		}
	}
	
	// Remove avatar via server-side API
	async function removeAvatar() {
		if (uploading) return;
		
		try {
			uploading = true;
			
			// Get JWT token for authentication
			const token = browser ? localStorage.getItem('supabase.auth.token') : null;
			if (!token) {
				throw new Error('Authentication token not found. Please log in again.');
			}

			const parsedToken = JSON.parse(token);
			const accessToken = parsedToken.access_token;
			
			// Remove via server-side API
			const response = await fetch('/api/auth/upload-avatar', {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${accessToken}`
				}
			});
			
			const result = await response.json();
			
			if (!response.ok) {
				throw new Error(result.error || 'Failed to remove avatar');
			}
			
			previewUrl = null;
			dispatch('removed');
			
		} catch (error) {
			console.error('Avatar removal error:', error);
			dispatch('error', { message: error.message || 'Failed to remove avatar' });
		} finally {
			uploading = false;
		}
	}
</script>

<div class="avatar-upload" class:disabled>
	<div 
		class="avatar-container"
		class:drag-over={dragOver}
		class:uploading
		style="width: {config.width}px; height: {config.height}px;"
		on:click={triggerFileInput}
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
		role="button"
		tabindex="0"
		on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
	>
		{#if previewUrl}
			<img 
				src={previewUrl} 
				alt="Avatar preview" 
				class="avatar-image"
			/>
			<div class="avatar-overlay">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
					<circle cx="12" cy="13" r="4"/>
				</svg>
			</div>
		{:else}
			<div class="avatar-placeholder">
				<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
					<circle cx="12" cy="13" r="4"/>
				</svg>
				<span class="upload-text {config.text}">
					{uploading ? 'Uploading...' : 'Add Photo'}
				</span>
			</div>
		{/if}
		
		{#if uploading}
			<div class="upload-progress">
				<div class="progress-spinner"></div>
			</div>
		{/if}
	</div>
	
	{#if previewUrl && !uploading}
		<button
			class="remove-button"
			on:click|stopPropagation={removeAvatar}
			title="Remove avatar"
			aria-label="Remove avatar"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<line x1="18" y1="6" x2="6" y2="18"/>
				<line x1="6" y1="6" x2="18" y2="18"/>
			</svg>
		</button>
	{/if}
	
	<input
		bind:this={fileInput}
		type="file"
		accept="image/jpeg,image/png,image/webp,image/gif"
		on:change={handleFileSelect}
		style="display: none;"
		{disabled}
	/>
</div>

<style>
	.avatar-upload {
		position: relative;
		display: inline-block;
	}
	
	.avatar-container {
		position: relative;
		border-radius: 50%;
		overflow: hidden;
		cursor: pointer;
		border: 3px dashed var(--color-border-primary);
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--color-bg-secondary);
	}
	
	.avatar-container:hover {
		border-color: var(--color-brand-primary);
		background-color: var(--color-bg-tertiary);
	}
	
	.avatar-container.drag-over {
		border-color: var(--color-brand-primary);
		background-color: var(--color-brand-primary-alpha-10);
		transform: scale(1.02);
	}
	
	.avatar-container.uploading {
		cursor: not-allowed;
		opacity: 0.7;
	}
	
	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 50%;
	}
	
	.avatar-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.2s ease;
		color: white;
		border-radius: 50%;
	}
	
	.avatar-container:hover .avatar-overlay {
		opacity: 1;
	}
	
	.avatar-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--color-text-secondary);
		text-align: center;
		padding: var(--space-4);
	}
	
	.upload-text {
		font-weight: 500;
		white-space: nowrap;
	}
	
	.upload-progress {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
	}
	
	.progress-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
	
	.remove-button {
		position: absolute;
		top: -8px;
		right: -8px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background-color: var(--color-error);
		color: white;
		border: 2px solid var(--color-bg-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.remove-button:hover {
		background-color: var(--color-error-dark);
		transform: scale(1.1);
	}
	
	.disabled {
		opacity: 0.5;
		pointer-events: none;
	}
</style>