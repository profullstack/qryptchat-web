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
			const result = await chat.joinGroupByInvite(inviteCode.trim().toUpperCase(), $user.id);

			if (result.success) {
				messages.success('Successfully joined the group!');
				dispatch('joined', result.data);
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
	<div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
		<div class="modal-header">
			<h2>Join a Group</h2>
			<button class="close-button" onclick={handleClose} aria-label="Close modal">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
				</svg>
			</button>
		</div>

		<div class="modal-body">
			<div class="join-info">
				<div class="info-icon">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
						<path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.996 2.996 0 0 0 17.06 7c-.8 0-1.54.37-2.01.97L12 11.5v3c0 .55-.45 1-1 1s-1-.45-1-1v-4l-4.5-4.5C5.19 5.69 4.8 5.5 4.38 5.5c-.83 0-1.5.67-1.5 1.5 0 .42.19.81.5 1.11L7 11.5V22h2v-6h2v6h9z"/>
					</svg>
				</div>
				<h3>Join with an invite code</h3>
				<p>Enter an invite code below to join an existing group. You can get invite codes from group members or administrators.</p>
			</div>

			<form class="join-form" onsubmit={handleSubmit}>
				<div class="form-group">
					<label for="invite-code">Invite Code</label>
					<input 
						id="invite-code"
						type="text" 
						bind:value={inviteCode}
						oninput={handleInputChange}
						placeholder="Enter invite code (e.g., ABC12345)"
						required
						maxlength="8"
						autocomplete="off"
						class="invite-input"
					/>
					<p class="help-text">
						Invite codes are usually 8 characters long and contain letters and numbers.
					</p>
				</div>

				<div class="form-actions">
					<button type="button" class="cancel-button" onclick={handleClose}>
						Cancel
					</button>
					<button 
						type="submit" 
						class="join-button"
						disabled={!inviteCode.trim() || loading}
					>
						{#if loading}
							<div class="button-spinner"></div>
							Joining...
						{:else}
							Join Group
						{/if}
					</button>
				</div>
			</form>

			<div class="additional-info">
				<div class="info-section">
					<h4>What happens when you join?</h4>
					<ul>
						<li>You'll be added to the group as a member</li>
						<li>You'll have access to all public rooms in the group</li>
						<li>You can participate in conversations and see message history</li>
						<li>Group administrators may assign you additional permissions</li>
					</ul>
				</div>

				<div class="info-section">
					<h4>Need help?</h4>
					<p>
						If you're having trouble joining a group, make sure:
					</p>
					<ul>
						<li>The invite code is correct and hasn't expired</li>
						<li>You haven't already joined this group</li>
						<li>The group still exists and is accepting new members</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: 0.75rem;
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 0 1.5rem;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.close-button {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.375rem;
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.join-info {
		text-align: center;
		margin-bottom: 2rem;
	}

	.info-icon {
		color: var(--color-primary-500);
		margin-bottom: 1rem;
	}

	.join-info h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.join-info p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.join-form {
		margin-bottom: 2rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.invite-input {
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		letter-spacing: 0.1em;
		text-align: center;
		text-transform: uppercase;
		transition: border-color 0.2s ease;
	}

	.invite-input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.invite-input::placeholder {
		text-transform: none;
		letter-spacing: normal;
		font-family: inherit;
	}

	.help-text {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.cancel-button {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.join-button {
		background: var(--color-primary-600);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: background-color 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.join-button:hover:not(:disabled) {
		background: var(--color-primary-700);
	}

	.join-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

	.additional-info {
		border-top: 1px solid var(--color-border);
		padding-top: 1.5rem;
	}

	.info-section {
		margin-bottom: 1.5rem;
	}

	.info-section:last-child {
		margin-bottom: 0;
	}

	.info-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.info-section p {
		margin: 0 0 0.5rem 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.info-section ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.info-section li {
		margin-bottom: 0.25rem;
	}

	.info-section li:last-child {
		margin-bottom: 0;
	}

	/* Responsive */
	@media (max-width: 640px) {
		.modal-content {
			margin: 1rem;
			max-height: calc(100vh - 2rem);
		}

		.form-actions {
			flex-direction: column;
		}

		.cancel-button,
		.join-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>