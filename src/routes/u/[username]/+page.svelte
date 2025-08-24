<script>
	import { page } from '$app/stores';
	import { user, isAuthenticated } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';

	/** @type {import('./$types').PageData} */
	export let data;

	let editing = false;
	let bio = data.profile?.bio || '';
	let website = data.profile?.website || '';
	let loading = false;
	let error = '';
	let success = '';
	let showAvatarUpload = false;

	$: isOwnProfile = $isAuthenticated && $user?.username === data.profile?.username;
	$: profileUser = data.profile;

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
			user.update(currentUser => ({
				...currentUser,
				avatarUrl
			}));
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
			user.update(currentUser => ({
				...currentUser,
				avatarUrl: null
			}));
		}
		
		success = 'Profile picture removed successfully!';
		showAvatarUpload = false;
		
		// Clear success message after 3 seconds
		setTimeout(() => {
			success = '';
		}, 3000);
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
			
			{#if isOwnProfile}
				<div class="profile-actions">
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
				</div>
			{/if}
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
</style>