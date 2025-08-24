<script>
	import { createEventDispatcher, onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';

	const dispatch = createEventDispatcher();

	// Props
	export let conversationId = '';
	export let isOpen = false;

	// State
	let loading = false;
	let saving = false;
	let error = '';
	let success = '';

	// Settings
	let currentSettings = {
		disappear_seconds: 0,
		start_on: 'delivered',
		enabled: false
	};

	// Presets
	let presets = [];
	let startOnOptions = [];

	// Selected values
	let selectedSeconds = 0;
	let selectedStartOn = 'delivered';

	/**
	 * Load current settings and presets
	 */
	async function loadSettings() {
		if (!conversationId) return;

		loading = true;
		error = '';

		try {
			// Load current settings
			const settingsResponse = await fetch(`/api/conversations/${conversationId}/disappearing-messages`);
			const settingsData = await settingsResponse.json();

			if (!settingsResponse.ok) {
				throw new Error(settingsData.error || 'Failed to load settings');
			}

			currentSettings = settingsData.settings;
			selectedSeconds = currentSettings.disappear_seconds;
			selectedStartOn = currentSettings.start_on;

			// Load presets (this could be cached)
			const presetsResponse = await fetch(`/api/conversations/${conversationId}/disappearing-messages/presets`);
			const presetsData = await presetsResponse.json();

			if (presetsResponse.ok) {
				presets = presetsData.presets || [];
				startOnOptions = presetsData.start_on_options || [];
			}

		} catch (err) {
			console.error('Error loading disappearing message settings:', err);
			error = err.message || 'Failed to load settings';
		} finally {
			loading = false;
		}
	}

	/**
	 * Save settings
	 */
	async function saveSettings() {
		if (!conversationId) return;

		saving = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/conversations/${conversationId}/disappearing-messages`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					disappear_seconds: selectedSeconds,
					start_on: selectedStartOn
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to save settings');
			}

			currentSettings = data.settings;
			success = data.message || 'Settings saved successfully';

			// Dispatch event to parent
			dispatch('settingsUpdated', {
				settings: currentSettings
			});

			// Auto-close after success
			setTimeout(() => {
				isOpen = false;
			}, 2000);

		} catch (err) {
			console.error('Error saving disappearing message settings:', err);
			error = err.message || 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	/**
	 * Handle preset selection
	 */
	function selectPreset(seconds) {
		selectedSeconds = seconds;
	}

	/**
	 * Format duration for display
	 */
	function formatDuration(seconds) {
		if (seconds === 0) return 'Off';
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
		return `${Math.floor(seconds / 86400)}d`;
	}

	/**
	 * Close modal
	 */
	function closeModal() {
		isOpen = false;
		error = '';
		success = '';
	}

	// Load settings when component mounts or conversationId changes
	$: if (conversationId && isOpen) {
		loadSettings();
	}

	// Reset form when modal opens
	$: if (isOpen) {
		selectedSeconds = currentSettings.disappear_seconds;
		selectedStartOn = currentSettings.start_on;
		error = '';
		success = '';
	}
</script>

{#if isOpen}
	<div class="modal-overlay" on:click={closeModal} on:keydown={(e) => e.key === 'Escape' && closeModal()}>
		<div class="modal" on:click|stopPropagation on:keydown|stopPropagation>
			<div class="modal-header">
				<h2>Disappearing Messages</h2>
				<button class="close-btn" on:click={closeModal} aria-label="Close">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				{#if loading}
					<div class="loading">
						<div class="spinner"></div>
						<p>Loading settings...</p>
					</div>
				{:else}
					<div class="settings-form">
						<div class="form-group">
							<label for="timer-presets">Timer Duration</label>
							<div class="preset-grid">
								{#each presets as preset}
									<button
										type="button"
										class="preset-btn"
										class:active={selectedSeconds === preset.seconds}
										on:click={() => selectPreset(preset.seconds)}
										title={preset.description}
									>
										{preset.label}
									</button>
								{/each}
							</div>
						</div>

						{#if selectedSeconds > 0}
							<div class="form-group">
								<label for="start-on">Start Timer</label>
								<select id="start-on" bind:value={selectedStartOn} class="select-input">
									{#each startOnOptions as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
								<p class="help-text">
									{startOnOptions.find(opt => opt.value === selectedStartOn)?.description || ''}
								</p>
							</div>
						{/if}

						<div class="current-settings">
							<h3>Current Settings</h3>
							<p><strong>Timer:</strong> {formatDuration(currentSettings.disappear_seconds)}</p>
							{#if currentSettings.enabled}
								<p><strong>Starts:</strong> {currentSettings.start_on === 'delivered' ? 'When delivered' : 'When read'}</p>
							{/if}
						</div>

						{#if error}
							<div class="error-message">
								{error}
							</div>
						{/if}

						{#if success}
							<div class="success-message">
								{success}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button type="button" class="btn btn-secondary" on:click={closeModal} disabled={saving}>
					Cancel
				</button>
				<button 
					type="button" 
					class="btn btn-primary" 
					on:click={saveSettings} 
					disabled={loading || saving}
				>
					{#if saving}
						<div class="btn-spinner"></div>
						Saving...
					{:else}
						Save Settings
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

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

	.modal {
		background: white;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
		max-width: 500px;
		width: 100%;
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
	}

	.close-btn {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: #6b7280;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid #e5e7eb;
		border-top: 3px solid #3b82f6;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-weight: 500;
		color: #374151;
		font-size: 0.875rem;
	}

	.preset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 0.5rem;
	}

	.preset-btn {
		padding: 0.75rem 1rem;
		border: 2px solid #e5e7eb;
		background: white;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.preset-btn:hover {
		border-color: #3b82f6;
		background: #eff6ff;
	}

	.preset-btn.active {
		border-color: #3b82f6;
		background: #3b82f6;
		color: white;
	}

	.select-input {
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		background: white;
	}

	.select-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.help-text {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
	}

	.current-settings {
		background: #f9fafb;
		padding: 1rem;
		border-radius: 6px;
		border: 1px solid #e5e7eb;
	}

	.current-settings h3 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.current-settings p {
		margin: 0.25rem 0;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.success-message {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #16a34a;
		padding: 0.75rem;
		border-radius: 6px;
		font-size: 0.875rem;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1.5rem;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: white;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #f9fafb;
	}

	.btn-primary {
		background: #3b82f6;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
</style>