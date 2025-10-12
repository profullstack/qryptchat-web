<script>
	import { createEventDispatcher } from 'svelte';
	import { chat } from '$lib/stores/chat.js';
	import { user } from '$lib/stores/auth.js';
	import { messages } from '$lib/stores/messages.js';

	const dispatch = createEventDispatcher();

	// Local state
	let inviteCode = '';
	let loading = false;

	// Handle close
	function handleClose() {
		dispatch('close');
	}

	// Join group by invite code
	async function joinGroup() {
		if (!inviteCode.trim() || !$user?.id) return;

		loading = true;
		try {
			// TODO: Implement joinGroupByInvite in WebSocket store
			console.log('Join group by invite not yet implemented in WebSocket store');
			const result = { success: false, error: 'Not implemented in WebSocket store yet', data: null };

			if (result.success) {
				messages.success('Successfully joined the group!');
				dispatch('joined', result.data || {});
				handleClose();
			} else {
				messages.error(result.error || 'Failed to join group');
			}
		} catch (error) {
			console.error('Failed to join group:', error);
			messages.error('Failed to join group');
		} finally {
			loading = false;
		}
	}

	// Handle form submit
	function handleSubmit(event) {
		event.preventDefault();
		joinGroup();
	}

	// Format invite code as user types
	function formatInviteCode(value) {
		// Remove any non-alphanumeric characters and convert to uppercase
		return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
	}

	// Handle input change
	function handleInputChange(event) {
		inviteCode = formatInviteCode(event.target.value);
	}
</script>

<div class="modal-overlay" onclick={handleClose} onkeydown={(e) => e.key === 'Escape' && handleClose()} role="dialog" aria-modal="true" tabindex="0">
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
		<!-- Enhanced Header with gradient -->
		<div class="modal-header">
			<div class="header-content">
				<div class="header-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.996 2.996 0 0 0 17.06 7c-.8 0-1.54.37-2.01.97L12 11.5v3c0 .55-.45 1-1 1s-1-.45-1-1v-4l-4.5-4.5C5.19 5.69 4.8 5.5 4.38 5.5c-.83 0-1.5.67-1.5 1.5 0 .42.19.81.5 1.11L7 11.5V22h2v-6h2v6h9z"/>
					</svg>
				</div>
				<div class="header-text">
					<h2>Join a Group</h2>
					<p>Connect with your community</p>
				</div>
			</div>
			<button class="close-button" onclick={handleClose} aria-label="Close modal">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
				</svg>
			</button>
		</div>

		<div class="modal-body">
			<!-- Welcome Section -->
			<div class="welcome-section">
				<div class="welcome-icon">
					<svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
					</svg>
				</div>
				<div class="welcome-content">
					<h3>Join with an invite code</h3>
					<p>Enter an invite code below to join an existing group. You can get invite codes from group members or administrators.</p>
				</div>
			</div>

			<!-- Enhanced Form -->
			<div class="form-container">
				<form class="join-form" onsubmit={handleSubmit}>
					<div class="input-section">
						<div class="input-header">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
								<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
							</svg>
							<label for="invite-code">Invite Code</label>
						</div>
						<div class="input-wrapper">
							<input
								id="invite-code"
								type="text"
								bind:value={inviteCode}
								oninput={handleInputChange}
								placeholder="ABC12345"
								required
								maxlength="8"
								autocomplete="off"
								class="invite-input"
							/>
							<div class="input-decoration"></div>
						</div>
						<p class="help-text">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
							</svg>
							Invite codes are usually 8 characters long and contain letters and numbers.
						</p>
					</div>

					<div class="form-actions">
						<button type="button" class="cancel-button" onclick={handleClose}>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
								<path d="M6 18L18 6M6 6l12 12"/>
							</svg>
							<span>Cancel</span>
						</button>
						<button
							type="submit"
							class="join-button"
							disabled={!inviteCode.trim() || loading}
						>
							{#if loading}
								<div class="button-spinner"></div>
								<span>Joining...</span>
							{:else}
								<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
									<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
								</svg>
								<span>Join Group</span>
							{/if}
						</button>
					</div>
				</form>
			</div>

			<!-- Enhanced Info Sections -->
			<div class="info-grid">
				<div class="info-card">
					<div class="card-header">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h4>What happens when you join?</h4>
					</div>
					<ul class="feature-list">
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
							</svg>
							You'll be added to the group as a member
						</li>
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
							</svg>
							Access to all public rooms in the group
						</li>
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
							</svg>
							Participate in conversations and see history
						</li>
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
							</svg>
							Administrators may assign additional permissions
						</li>
					</ul>
				</div>

				<div class="info-card">
					<div class="card-header">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
						</svg>
						<h4>Need help?</h4>
					</div>
					<p class="help-description">
						If you're having trouble joining a group, make sure:
					</p>
					<ul class="help-list">
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
							</svg>
							The invite code is correct and hasn't expired
						</li>
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
							</svg>
							You haven't already joined this group
						</li>
						<li>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
							</svg>
							The group still exists and is accepting new members
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	/* Modal Overlay */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	/* Modal Container */
	.modal-content {
		background: var(--color-surface, #ffffff);
		border-radius: 1rem;
		width: 100%;
		max-width: 540px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		border: 1px solid var(--color-border, #e5e7eb);
		overflow: hidden;
	}

	/* Enhanced Header */
	.modal-header {
		background: linear-gradient(135deg, var(--color-primary-500, #3b82f6) 0%, var(--color-primary-600, #2563eb) 100%);
		color: white;
		padding: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: relative;
	}

	.modal-header::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") repeat;
		opacity: 0.3;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 1rem;
		position: relative;
		z-index: 1;
	}

	.header-icon {
		width: 2.5rem;
		height: 2.5rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.header-text h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.header-text p {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		opacity: 0.9;
		font-weight: 400;
	}

	.close-button {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		color: white;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
		position: relative;
		z-index: 1;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	/* Modal Body */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		background: var(--color-background, #f9fafb);
	}

	/* Welcome Section */
	.welcome-section {
		background: var(--color-surface, #ffffff);
		border-radius: 1rem;
		padding: 2rem;
		text-align: center;
		margin-bottom: 1.5rem;
		border: 1px solid var(--color-border, #e5e7eb);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.welcome-icon {
		color: var(--color-primary-500, #3b82f6);
		margin-bottom: 1rem;
		display: flex;
		justify-content: center;
	}

	.welcome-content h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary, #111827);
	}

	.welcome-content p {
		margin: 0;
		color: var(--color-text-secondary, #6b7280);
		font-size: 0.875rem;
		line-height: 1.6;
		max-width: 400px;
		margin-left: auto;
		margin-right: auto;
	}

	/* Form Container */
	.form-container {
		background: var(--color-surface, #ffffff);
		border-radius: 1rem;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		border: 1px solid var(--color-border, #e5e7eb);
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	/* Input Section */
	.input-section {
		margin-bottom: 1.5rem;
	}

	.input-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		color: var(--color-primary-600, #2563eb);
	}

	.input-header label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary, #111827);
		margin: 0;
	}

	.input-wrapper {
		position: relative;
	}

	.invite-input {
		width: 100%;
		padding: 1rem 1.25rem;
		border: 2px solid var(--color-border, #e5e7eb);
		border-radius: 0.75rem;
		background: var(--color-surface, #ffffff);
		color: var(--color-text-primary, #111827);
		font-size: 1.125rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		letter-spacing: 0.2em;
		text-align: center;
		text-transform: uppercase;
		transition: all 0.3s ease;
		font-weight: 600;
	}

	.invite-input:focus {
		outline: none;
		border-color: var(--color-primary-500, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
		transform: translateY(-1px);
	}

	.invite-input::placeholder {
		text-transform: uppercase;
		letter-spacing: 0.2em;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		color: var(--color-text-secondary, #6b7280);
		opacity: 0.6;
	}

	.input-decoration {
		position: absolute;
		bottom: -2px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500, #3b82f6), var(--color-primary-600, #2563eb));
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.invite-input:focus + .input-decoration {
		width: 100%;
	}

	.help-text {
		margin: 0.75rem 0 0 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #6b7280);
		line-height: 1.5;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		justify-content: center;
	}

	/* Form Actions */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.cancel-button {
		background: var(--color-surface, #ffffff);
		border: 2px solid var(--color-border, #e5e7eb);
		color: var(--color-text-secondary, #6b7280);
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.cancel-button:hover {
		background: var(--color-surface-hover, #f9fafb);
		color: var(--color-text-primary, #111827);
		border-color: var(--color-gray-300, #d1d5db);
		transform: translateY(-1px);
	}

	.join-button {
		background: linear-gradient(135deg, var(--color-primary-500, #3b82f6) 0%, var(--color-primary-600, #2563eb) 100%);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.join-button:hover:not(:disabled) {
		background: linear-gradient(135deg, var(--color-primary-600, #2563eb) 0%, var(--color-primary-700, #1d4ed8) 100%);
		transform: translateY(-1px);
		box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15);
	}

	.join-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
		box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
	}

	.button-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Info Grid */
	.info-grid {
		display: grid;
		gap: 1rem;
		grid-template-columns: 1fr;
	}

	.info-card {
		background: var(--color-surface, #ffffff);
		border-radius: 0.75rem;
		padding: 1.25rem;
		border: 1px solid var(--color-border, #e5e7eb);
		box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.06);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		color: var(--color-primary-600, #2563eb);
	}

	.card-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary, #111827);
	}

	.feature-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.feature-list li {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #6b7280);
		line-height: 1.5;
	}

	.feature-list li:last-child {
		margin-bottom: 0;
	}

	.feature-list li svg {
		color: var(--color-green-500, #10b981);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	.help-description {
		margin: 0 0 0.75rem 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #6b7280);
		line-height: 1.5;
	}

	.help-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.help-list li {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #6b7280);
		line-height: 1.5;
	}

	.help-list li:last-child {
		margin-bottom: 0;
	}

	.help-list li svg {
		color: var(--color-amber-500, #f59e0b);
		flex-shrink: 0;
		margin-top: 0.125rem;
	}

	/* Responsive Design */
	@media (max-width: 640px) {
		.modal-overlay {
			padding: 0.5rem;
		}

		.modal-content {
			max-width: 100%;
			max-height: 95vh;
		}

		.modal-header {
			padding: 1rem;
		}

		.header-text h2 {
			font-size: 1.125rem;
		}

		.header-text p {
			font-size: 0.8125rem;
		}

		.modal-body {
			padding: 1rem;
		}

		.welcome-section {
			padding: 1.5rem;
		}

		.welcome-content h3 {
			font-size: 1.125rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.cancel-button,
		.join-button {
			width: 100%;
			justify-content: center;
		}

		.info-grid {
			grid-template-columns: 1fr;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.modal-content {
			--color-surface: #1f2937;
			--color-background: #111827;
			--color-border: #374151;
			--color-text-primary: #f9fafb;
			--color-text-secondary: #9ca3af;
			--color-surface-hover: #374151;
			--color-gray-300: #6b7280;
			--color-green-500: #10b981;
			--color-amber-500: #f59e0b;
		}
	}
</style>