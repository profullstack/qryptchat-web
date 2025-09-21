<script>
	import { page } from '$app/stores';
	import { user, isAuthenticated, auth } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';
	import { publicKeyService } from '$lib/crypto/public-key-service.js';
	import { voiceCallManager } from '$lib/stores/voice-call.js';

	/** @type {import('./$types').PageData} */
	export let data;

	let editing = false;
	let bio = data.profile?.bio || '';
	let website = data.profile?.website || '';
	let loading = false;
	let error = '';
	let success = '';
	let showAvatarUpload = false;
	let userPublicKey = '';
	let publicKeyCopied = false;
	let loadingPublicKey = false;

	$: isOwnProfile = $isAuthenticated && $user?.username === data.profile?.username;
	$: profileUser = data.profile;

	// Load user's public key when component mounts or profile changes
	onMount(() => {
		if (profileUser?.id) {
			loadUserPublicKey();
		}
	});

	$: if (profileUser?.id) {
		loadUserPublicKey();
	}

	async function handleSave() {
		if (!isOwnProfile) return;
		
		loading = true;
		error = '';
		success = '';

		try {
			/** @type {Record<string, string>} */
			const headers = {
				'Content-Type': 'application/json'
			};

			// Add Authorization header with JWT token
			const storedSession = browser ? localStorage.getItem('qrypt_session') : null;
			if (storedSession) {
				const session = JSON.parse(storedSession);
				if (session.access_token) {
					headers['Authorization'] = `Bearer ${session.access_token}`;
				}
			}

			const response = await fetch('/api/profile/update', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					bio: bio.trim(),
					website: website.trim()
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update profile');
			}

			// Update local data
			data.profile.bio = bio.trim();
			data.profile.website = website.trim();
			
			editing = false;
			success = 'Profile updated successfully!';
			
			// Clear success message after 3 seconds
			setTimeout(() => {
				success = '';
			}, 3000);

		} catch (err) {
			error = err.message;
		} finally {
			loading = false;
		}
	}

	function handleCancel() {
		bio = data.profile?.bio || '';
		website = data.profile?.website || '';
		editing = false;
		error = '';
	}

	function formatWebsiteUrl(url) {
		if (!url) return '';
		if (url.startsWith('http://') || url.startsWith('https://')) {
			return url;
		}
		return `https://${url}`;
	}

	function getDisplayUrl(url) {
		if (!url) return '';
		return url.replace(/^https?:\/\//, '');
	}

	/**
	 * Handle avatar upload success
	 * @param {CustomEvent} event
	 */
	function handleAvatarUploaded(event) {
		const { avatarUrl } = event.detail;
		
		// Update the profile data with new avatar
		data.profile.avatarUrl = avatarUrl;
		
		// Update the user store if this is the current user's profile
		if (isOwnProfile && $user) {
			auth.updateUser({ avatarUrl });
		}
		
		success = 'Profile picture updated successfully!';
		showAvatarUpload = false;
		
		// Clear success message after 3 seconds
		setTimeout(() => {
			success = '';
		}, 3000);
	}

	/**
	 * Handle avatar upload error
	 * @param {CustomEvent} event
	 */
	function handleAvatarError(event) {
		error = event.detail.message || 'Failed to upload profile picture';
	}

	/**
	 * Handle avatar removal
	 */
	function handleAvatarRemoved() {
		// Update the profile data to remove avatar
		data.profile.avatarUrl = null;
		
		// Update the user store if this is the current user's profile
		if (isOwnProfile && $user) {
			auth.updateUser({ avatarUrl: null });
		}
		
		success = 'Profile picture removed successfully!';
		showAvatarUpload = false;
		
		// Clear success message after 3 seconds
		setTimeout(() => {
			success = '';
		}, 3000);
	}

	/**
		* Load user's public key from the database
		*/
	async function loadUserPublicKey() {
		if (!profileUser?.id || loadingPublicKey) return;
		
		try {
			loadingPublicKey = true;
			await publicKeyService.initialize();
			
			const publicKey = await publicKeyService.getUserPublicKey(profileUser.id);
			userPublicKey = publicKey || '';
		} catch (err) {
			console.error('Failed to load user public key:', err);
			userPublicKey = '';
		} finally {
			loadingPublicKey = false;
		}
	}

	/**
		* Copy public key to clipboard
		*/
	async function copyPublicKey() {
		if (!userPublicKey) return;
		
		try {
			await navigator.clipboard.writeText(userPublicKey);
			publicKeyCopied = true;
			setTimeout(() => {
				publicKeyCopied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy public key:', err);
		}
	}

	/**
	 * Handle sending a message to this user
	 */
	async function handleSendMessage() {
		if (!profileUser?.id || !$isAuthenticated) return;
		
		loading = true;
		error = '';
		
		try {
			/** @type {Record<string, string>} */
			const headers = {
				'Content-Type': 'application/json'
			};

			// Add Authorization header with JWT token
			const storedSession = browser ? localStorage.getItem('qrypt_session') : null;
			if (storedSession) {
				const session = JSON.parse(storedSession);
				if (session.access_token) {
					headers['Authorization'] = `Bearer ${session.access_token}`;
				}
			}

			const response = await fetch('/api/chat/conversations', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					type: 'direct',
					participant_ids: [profileUser.id]
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create conversation');
			}

			// Navigate to the chat with this conversation using clean URL
			goto(`/chats/${result.conversation_id}`);

		} catch (err) {
			console.error('Failed to create conversation:', err);
			error = err instanceof Error ? err.message : 'Failed to start conversation';
		} finally {
			loading = false;
		}
	}

	/**
	 * Handle voice call initiation
	 */
	async function handleVoiceCall() {
		if (!profileUser?.id || !$isAuthenticated) return;
		
		try {
			console.log('Initiating voice call with:', profileUser.username);
			
			await voiceCallManager.startCall(
				profileUser.id,
				profileUser.displayName || profileUser.username,
				'voice',
				profileUser.avatarUrl
			);
		} catch (error) {
			console.error('Failed to start voice call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			alert(`Failed to start voice call: ${errorMessage}`);
		}
	}

	/**
	 * Handle video call initiation
	 */
	async function handleVideoCall() {
		if (!profileUser?.id || !$isAuthenticated) return;
		
		try {
			console.log('Initiating video call with:', profileUser.username);
			
			await voiceCallManager.startCall(
				profileUser.id,
				profileUser.displayName || profileUser.username,
				'video',
				profileUser.avatarUrl
			);
		} catch (error) {
			console.error('Failed to start video call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			alert(`Failed to start video call: ${errorMessage}`);
		}
	}
</script>

<svelte:head>
	<title>{profileUser?.displayName || profileUser?.username || 'User'} - QryptChat</title>
	<meta name="description" content="View {profileUser?.displayName || profileUser?.username || 'user'}'s profile on QryptChat" />
</svelte:head>

<div class="profile-container">
	<div class="profile-header">
		<div class="profile-avatar-container">
			<div class="profile-avatar">
				{#if profileUser?.avatarUrl}
					<img src={profileUser.avatarUrl} alt={profileUser.displayName || profileUser.username} />
				{:else}
					<div class="avatar-placeholder">
						{(profileUser?.displayName || profileUser?.username || 'U').charAt(0).toUpperCase()}
					</div>
				{/if}
			</div>
			
			{#if isOwnProfile}
				<button
					class="avatar-edit-btn"
					on:click={() => showAvatarUpload = !showAvatarUpload}
					aria-label="Change profile picture"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
						<circle cx="12" cy="13" r="4"/>
					</svg>
				</button>
			{/if}
		</div>
		
		<div class="profile-info">
			<h1 class="profile-name">
				{profileUser?.displayName || profileUser?.username || 'Unknown User'}
			</h1>
			{#if profileUser?.displayName && profileUser?.username}
				<p class="profile-username">@{profileUser.username}</p>
			{/if}
			
			<div class="profile-actions">
				{#if isOwnProfile}
					{#if !editing}
						<button class="btn btn-secondary" on:click={() => editing = true}>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
								<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
							</svg>
							Edit Profile
						</button>
					{:else}
						<div class="edit-actions">
							<button class="btn btn-primary" on:click={handleSave} disabled={loading}>
								{#if loading}
									<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M21 12a9 9 0 11-6.219-8.56"/>
									</svg>
								{:else}
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="20,6 9,17 4,12"/>
									</svg>
								{/if}
								Save
							</button>
							<button class="btn btn-ghost" on:click={handleCancel} disabled={loading}>
								Cancel
							</button>
						</div>
					{/if}
				{:else if $isAuthenticated}
					<div class="profile-actions-grid">
						<button class="btn btn-primary" on:click={handleSendMessage} disabled={loading}>
							{#if loading}
								<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 12a9 9 0 11-6.219-8.56"/>
								</svg>
							{:else}
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="m3 3 3 9-3 9 19-9Z"/>
									<path d="m6 12 13 0"/>
								</svg>
							{/if}
							Message
						</button>
						
						<button class="btn btn-call-voice" on:click={handleVoiceCall} title="Voice Call">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
							</svg>
						</button>
						
						<button class="btn btn-call-video" on:click={handleVideoCall} title="Video Call">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polygon points="23 7 16 12 23 17 23 7"/>
								<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
							</svg>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if error}
		<div class="alert alert-error">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10"/>
				<line x1="15" y1="9" x2="9" y2="15"/>
				<line x1="9" y1="9" x2="15" y2="15"/>
			</svg>
			{error}
		</div>
	{/if}

	{#if success}
		<div class="alert alert-success">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<polyline points="20,6 9,17 4,12"/>
			</svg>
			{success}
		</div>
	{/if}

	{#if showAvatarUpload && isOwnProfile}
		<div class="avatar-upload-section">
			<div class="avatar-upload-header">
				<h3>Update Profile Picture</h3>
				<button
					class="btn btn-ghost btn-sm"
					on:click={() => showAvatarUpload = false}
					aria-label="Close avatar upload"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
			<AvatarUpload
				userId={$user?.id}
				currentAvatarUrl={profileUser?.avatarUrl}
				on:uploaded={handleAvatarUploaded}
				on:error={handleAvatarError}
				on:removed={handleAvatarRemoved}
			/>
		</div>
	{/if}

	<div class="profile-content">
		<!-- Bio Section -->
		<div class="profile-section">
			<h2 class="section-title">About</h2>
			{#if editing}
				<div class="form-group">
					<label for="bio" class="form-label">Bio</label>
					<textarea
						id="bio"
						bind:value={bio}
						placeholder="Tell us about yourself..."
						rows="4"
						maxlength="500"
						class="form-textarea"
					></textarea>
					<div class="form-help">
						{bio.length}/500 characters
					</div>
				</div>
			{:else if profileUser?.bio}
				<p class="profile-bio">{profileUser.bio}</p>
			{:else if isOwnProfile}
				<p class="profile-empty">Add a bio to tell others about yourself.</p>
			{:else}
				<p class="profile-empty">No bio available.</p>
			{/if}
		</div>

		<!-- Website Section -->
		<div class="profile-section">
			<h2 class="section-title">Website</h2>
			{#if editing}
				<div class="form-group">
					<label for="website" class="form-label">Website URL</label>
					<input
						id="website"
						type="url"
						bind:value={website}
						placeholder="https://example.com"
						class="form-input"
					/>
					<div class="form-help">
						Enter your website or social media profile URL
					</div>
				</div>
			{:else if profileUser?.website}
				<a 
					href={formatWebsiteUrl(profileUser.website)} 
					target="_blank" 
					rel="noopener noreferrer"
					class="profile-website"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
					</svg>
					{getDisplayUrl(profileUser.website)}
				</a>
			{:else if isOwnProfile}
				<p class="profile-empty">Add your website or social media link.</p>
			{:else}
				<p class="profile-empty">No website available.</p>
			{/if}
		</div>

		<!-- Public Key Section -->
		<div class="profile-section">
			<h2 class="section-title">🔐 Public Key</h2>
			{#if loadingPublicKey}
				<div class="loading-state">
					<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					Loading public key...
				</div>
			{:else if userPublicKey}
				<div class="public-key-display">
					<p class="public-key-description">
						This is {isOwnProfile ? 'your' : `${profileUser?.displayName || profileUser?.username || 'this user\'s'}`} quantum-resistant public key.
						{#if !isOwnProfile}
							You can use this to send encrypted messages that only they can read.
						{:else}
							Others can use this to send you encrypted messages that only you can read.
						{/if}
					</p>
					
					<div class="key-display">
						<div class="key-content">
							<code class="public-key">{userPublicKey}</code>
						</div>
						<button
							class="btn copy-btn"
							on:click={copyPublicKey}
							title="Copy public key to clipboard"
						>
							{#if publicKeyCopied}
								✅ Copied!
							{:else}
								📋 Copy
							{/if}
						</button>
					</div>
					
					<div class="key-info">
						<p><strong>🛡️ Security Details:</strong></p>
						<ul>
							<li><strong>Algorithm:</strong> ML-KEM-1024 (Post-Quantum)</li>
							<li><strong>Quantum-Resistant:</strong> Safe against quantum computer attacks</li>
							<li><strong>FIPS 203 Compliant:</strong> Government-approved encryption standard</li>
						</ul>
					</div>
				</div>
			{:else}
				<p class="profile-empty">
					{#if isOwnProfile}
						No public key available. Generate encryption keys in your settings to enable secure messaging.
					{:else}
						This user hasn't set up encryption keys yet.
					{/if}
				</p>
			{/if}
		</div>
	</div>
</div>


<style>
	.profile-container {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--space-6);
	}

	.profile-header {
		display: flex;
		gap: var(--space-6);
		margin-bottom: var(--space-8);
		align-items: flex-start;
	}

	.profile-avatar-container {
		position: relative;
		flex-shrink: 0;
	}

	.profile-avatar {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		overflow: hidden;
		border: 4px solid var(--color-border-primary);
	}

	.avatar-edit-btn {
		position: absolute;
		bottom: 0;
		right: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-brand-primary);
		color: white;
		border: 2px solid var(--color-bg-primary);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.avatar-edit-btn:hover {
		background: var(--color-brand-secondary);
		transform: scale(1.05);
	}

	.avatar-edit-btn:focus {
		outline: 2px solid var(--color-brand-primary);
		outline-offset: 2px;
	}

	.profile-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--color-brand-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 2.5rem;
	}

	.profile-info {
		flex: 1;
		min-width: 0;
	}

	.profile-name {
		font-size: 2rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 var(--space-2) 0;
		word-break: break-word;
	}

	.profile-username {
		font-size: 1.125rem;
		color: var(--color-text-secondary);
		margin: 0 0 var(--space-4) 0;
	}

	.profile-actions {
		margin-top: var(--space-4);
	}

	.edit-actions {
		display: flex;
		gap: var(--space-3);
		align-items: center;
	}

	.profile-content {
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
	}

	.profile-section {
		background: var(--color-bg-secondary);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		border: 1px solid var(--color-border-primary);
	}

	.section-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 var(--space-4) 0;
	}

	.profile-bio {
		color: var(--color-text-primary);
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-word;
	}

	.profile-website {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-brand-primary);
		text-decoration: none;
		font-weight: 500;
		transition: color 0.2s ease;
	}

	.profile-website:hover {
		color: var(--color-brand-secondary);
		text-decoration: underline;
	}

	.profile-empty {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.form-label {
		font-weight: 500;
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}

	.form-input,
	.form-textarea {
		padding: var(--space-3);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-md);
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.form-input:focus,
	.form-textarea:focus {
		outline: none;
		border-color: var(--color-brand-primary);
	}

	.form-textarea {
		resize: vertical;
		min-height: 100px;
		font-family: inherit;
	}

	.form-help {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.alert {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-6);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.alert-error {
		background: var(--color-error-bg);
		color: var(--color-error);
		border: 1px solid var(--color-error-border);
	}

	.alert-success {
		background: var(--color-success-bg);
		color: var(--color-success);
		border: 1px solid var(--color-success-border);
	}

	.avatar-upload-section {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		margin-bottom: var(--space-6);
	}

	.avatar-upload-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-4);
	}

	.avatar-upload-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
	}

	.btn-sm {
		padding: var(--space-2);
		font-size: 0.875rem;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Responsive Design */
	@media (max-width: 640px) {
		.profile-container {
			padding: var(--space-4);
		}

		.profile-header {
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: var(--space-4);
		}

		.profile-avatar {
			width: 100px;
			height: 100px;
		}

		.avatar-edit-btn {
			width: 32px;
			height: 32px;
		}

		.avatar-upload-section {
			padding: var(--space-4);
		}

		.avatar-upload-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-2);
		}

		.avatar-placeholder {
			font-size: 2rem;
		}

		.profile-name {
			font-size: 1.75rem;
		}

		.edit-actions {
			flex-direction: column;
			width: 100%;
		}

		.edit-actions .btn {
			width: 100%;
			justify-content: center;
		}
	}

	/* Public Key Styles */
	.loading-state {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.public-key-display {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.public-key-description {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		line-height: 1.5;
		margin: 0;
	}

	.key-display {
		display: flex;
		gap: var(--space-3);
		align-items: flex-start;
	}

	.key-content {
		flex: 1;
		min-width: 0;
	}

	.public-key {
		display: block;
		width: 100%;
		padding: var(--space-3);
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-md);
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.75rem;
		color: var(--color-text-primary);
		word-break: break-all;
		line-height: 1.4;
		white-space: pre-wrap;
	}

	.copy-btn {
		flex-shrink: 0;
		padding: var(--space-3) var(--space-4);
		font-size: 0.8125rem;
		background: var(--color-brand-primary);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		min-width: 100px;
		text-align: center;
	}

	.copy-btn:hover {
		background: var(--color-brand-secondary);
	}

	.key-info {
		padding: var(--space-4);
		background: var(--color-bg-primary);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-primary);
	}

	.key-info p {
		margin: 0 0 var(--space-2) 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.key-info ul {
		margin: 0;
		padding-left: var(--space-5);
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.key-info li {
		margin-bottom: var(--space-2);
	}

	.key-info li:last-child {
		margin-bottom: 0;
	}

	@media (max-width: 640px) {
		.key-display {
			flex-direction: column;
			gap: var(--space-3);
		}

		.copy-btn {
			align-self: flex-start;
		}
	}

	/* Profile Actions Grid */
	.profile-actions-grid {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		flex-wrap: wrap;
	}

	.btn-call-voice,
	.btn-call-video {
		padding: var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		height: 44px;
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-primary);
	}

	.btn-call-voice:hover {
		background: var(--color-success);
		color: white;
		border-color: var(--color-success);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
	}

	.btn-call-video:hover {
		background: var(--color-brand-primary);
		color: white;
		border-color: var(--color-brand-primary);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.btn-call-voice:focus,
	.btn-call-video:focus {
		outline: none;
		ring: 2px solid var(--color-brand-primary);
	}

	@media (max-width: 640px) {
		.profile-actions-grid {
			flex-direction: column;
			width: 100%;
		}

		.profile-actions-grid .btn {
			width: 100%;
			justify-content: center;
		}

		.btn-call-voice,
		.btn-call-video {
			width: 100%;
			justify-content: center;
			gap: var(--space-2);
		}

		.btn-call-voice::after {
			content: "Voice Call";
			font-size: 0.875rem;
		}

		.btn-call-video::after {
			content: "Video Call";
			font-size: 0.875rem;
		}
	}
</style>