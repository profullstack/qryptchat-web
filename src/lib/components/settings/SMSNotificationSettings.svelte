<script>
	import { createEventDispatcher } from 'svelte';
	import { createSupabaseClient } from '$lib/supabase.js';
	
	const dispatch = createEventDispatcher();
	const supabase = createSupabaseClient();
	
	let { user = $bindable() } = $props();
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	
	// Reactive state for SMS notifications enabled
	let smsNotificationsEnabled = $state(user?.sms_notifications_enabled ?? false);
	
	/**
	 * Update SMS notification preference
	 */
	async function updateSMSPreference() {
		if (!user?.id) {
			error = 'User not found';
			return;
		}
		
		loading = true;
		error = '';
		success = '';
		
		try {
			const { error: updateError } = await supabase
				.from('users')
				.update({ sms_notifications_enabled: smsNotificationsEnabled })
				.eq('id', user.id);
			
			if (updateError) {
				throw updateError;
			}
			
			// Update local user object
			user.sms_notifications_enabled = smsNotificationsEnabled;
			
			success = 'SMS notification preference updated successfully';
			dispatch('updated', { smsNotificationsEnabled });
			
			// Clear success message after 3 seconds
			setTimeout(() => {
				success = '';
			}, 3000);
			
		} catch (err) {
			console.error('Failed to update SMS preference:', err);
			error = err.message || 'Failed to update SMS notification preference';
		} finally {
			loading = false;
		}
	}
</script>

<div class="sms-settings">
	<h3>SMS Notifications</h3>
	<p class="description">
		Get SMS notifications when you receive messages while you're away from the app.
	</p>
	
	<div class="setting-item">
		<label class="toggle-label">
			<input
				type="checkbox"
				bind:checked={smsNotificationsEnabled}
				onchange={updateSMSPreference}
				disabled={loading}
				class="toggle-input"
			/>
			<span class="toggle-slider"></span>
			<span class="toggle-text">
				{smsNotificationsEnabled ? 'SMS notifications enabled' : 'SMS notifications disabled'}
			</span>
		</label>
	</div>
	
	{#if loading}
		<div class="status loading">
			<span class="spinner"></span>
			Updating preference...
		</div>
	{/if}
	
	{#if error}
		<div class="status error">
			{error}
		</div>
	{/if}
	
	{#if success}
		<div class="status success">
			{success}
		</div>
	{/if}
	
	<div class="info">
		<p class="info-text">
			<strong>Note:</strong> SMS notifications are only sent when you're inactive for more than 5 minutes.
			You'll receive notifications for messages in conversations you're participating in.
		</p>
	</div>
</div>

<style>
	.sms-settings {
		padding: 1.5rem;
		border: 1px solid var(--border-color, #e2e8f0);
		border-radius: 0.5rem;
		background: var(--bg-color, #ffffff);
	}
	
	h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary, #1a202c);
	}
	
	.description {
		margin: 0 0 1.5rem 0;
		color: var(--text-secondary, #4a5568);
		font-size: 0.875rem;
		line-height: 1.4;
	}
	
	.setting-item {
		margin-bottom: 1rem;
	}
	
	.toggle-label {
		display: flex;
		align-items: center;
		cursor: pointer;
		user-select: none;
	}
	
	.toggle-input {
		display: none;
	}
	
	.toggle-slider {
		position: relative;
		width: 3rem;
		height: 1.5rem;
		background: var(--toggle-bg-off, #cbd5e0);
		border-radius: 0.75rem;
		transition: background-color 0.2s ease;
		margin-right: 0.75rem;
	}
	
	.toggle-slider::before {
		content: '';
		position: absolute;
		top: 0.125rem;
		left: 0.125rem;
		width: 1.25rem;
		height: 1.25rem;
		background: white;
		border-radius: 50%;
		transition: transform 0.2s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}
	
	.toggle-input:checked + .toggle-slider {
		background: var(--toggle-bg-on, #48bb78);
	}
	
	.toggle-input:checked + .toggle-slider::before {
		transform: translateX(1.5rem);
	}
	
	.toggle-input:disabled + .toggle-slider {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.toggle-text {
		font-size: 0.875rem;
		color: var(--text-primary, #1a202c);
		font-weight: 500;
	}
	
	.status {
		padding: 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	
	.status.loading {
		background: var(--bg-info, #ebf8ff);
		color: var(--text-info, #2b6cb0);
		border: 1px solid var(--border-info, #bee3f8);
	}
	
	.status.error {
		background: var(--bg-error, #fed7d7);
		color: var(--text-error, #c53030);
		border: 1px solid var(--border-error, #feb2b2);
	}
	
	.status.success {
		background: var(--bg-success, #f0fff4);
		color: var(--text-success, #276749);
		border: 1px solid var(--border-success, #9ae6b4);
	}
	
	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	
	.info {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--bg-info-light, #f7fafc);
		border-radius: 0.375rem;
		border-left: 4px solid var(--border-info, #3182ce);
	}
	
	.info-text {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-secondary, #4a5568);
		line-height: 1.4;
	}
	
	.info-text strong {
		color: var(--text-primary, #1a202c);
	}
</style>