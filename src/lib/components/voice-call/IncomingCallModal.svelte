<script>
	import { hasIncomingCall, currentCall, voiceCallManager } from '$lib/stores/voice-call.js';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let callData = null;

	// Subscribe to incoming call changes
	$: if ($hasIncomingCall && $currentCall) {
		callData = $currentCall;
	}

	/**
	 * Accept the incoming call
	 */
	async function acceptCall() {
		if (!callData?.id) return;
		
		try {
			await voiceCallManager.acceptCall(callData.id);
			dispatch('accepted', { callId: callData.id });
		} catch (error) {
			console.error('Failed to accept call:', error);
		}
	}

	/**
	 * Decline the incoming call
	 */
	async function declineCall() {
		if (!callData?.id) return;
		
		try {
			await voiceCallManager.endCall(callData.id);
			dispatch('declined', { callId: callData.id });
		} catch (error) {
			console.error('Failed to decline call:', error);
		}
	}
</script>

{#if $hasIncomingCall && callData}
	<!-- Modal backdrop -->
	<div class="call-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
		<!-- Modal content -->
		<div class="call-modal">
			<div class="call-header">
				<div class="call-type-indicator">
					{#if callData.type === 'video'}
						<svg class="call-icon video" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polygon points="23 7 16 12 23 17 23 7"/>
							<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
						</svg>
						Video Call
					{:else}
						<svg class="call-icon voice" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
						</svg>
						Voice Call
					{/if}
				</div>
			</div>

			<div class="caller-info">
				<!-- Caller avatar -->
				<div class="caller-avatar">
					{#if callData.participantAvatar}
						<img src={callData.participantAvatar} alt={callData.participantName} />
					{:else}
						<div class="avatar-placeholder">
							{callData.participantName?.charAt(0)?.toUpperCase() || 'U'}
						</div>
					{/if}
				</div>

				<!-- Caller details -->
				<div class="caller-details">
					<h2 id="incoming-call-title" class="caller-name">
						{callData.participantName || 'Unknown User'}
					</h2>
					<p class="call-status">Incoming call...</p>
				</div>
			</div>

			<!-- Call action buttons -->
			<div class="call-actions">
				<button 
					class="call-btn decline-btn" 
					on:click={declineCall}
					aria-label="Decline call"
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
					</svg>
					Decline
				</button>

				<button 
					class="call-btn accept-btn" 
					on:click={acceptCall}
					aria-label="Accept call"
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
					</svg>
					Accept
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.call-modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.call-modal {
		background: var(--color-bg-primary);
		border-radius: var(--radius-xl);
		padding: var(--space-8);
		min-width: 320px;
		max-width: 400px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
		border: 1px solid var(--color-border-primary);
		animation: call-modal-enter 0.3s ease-out;
	}

	@keyframes call-modal-enter {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.call-header {
		text-align: center;
		margin-bottom: var(--space-6);
	}

	.call-type-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
	}

	.call-icon.voice {
		color: var(--color-success);
	}

	.call-icon.video {
		color: var(--color-brand-primary);
	}

	.caller-info {
		text-align: center;
		margin-bottom: var(--space-8);
	}

	.caller-avatar {
		width: 120px;
		height: 120px;
		border-radius: 50%;
		margin: 0 auto var(--space-6) auto;
		overflow: hidden;
		border: 4px solid var(--color-border-primary);
		position: relative;
	}

	.caller-avatar img {
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
		font-size: 2.5rem;
		font-weight: 600;
	}

	.caller-name {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0 0 var(--space-2) 0;
	}

	.call-status {
		color: var(--color-text-secondary);
		font-size: 1rem;
		margin: 0;
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.call-actions {
		display: flex;
		justify-content: center;
		gap: var(--space-6);
	}

	.call-btn {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		flex-direction: column;
		gap: var(--space-1);
		position: relative;
		overflow: hidden;
	}

	.call-btn::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 0;
		height: 0;
		border-radius: 50%;
		transition: all 0.2s ease;
		z-index: 0;
	}

	.call-btn:hover::before {
		width: 100%;
		height: 100%;
	}

	.call-btn svg {
	  position: relative;
	  z-index: 1;
	}

	.decline-btn {
		background: var(--color-error);
		color: white;
	}

	.decline-btn::before {
		background: rgba(255, 255, 255, 0.1);
	}

	.decline-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
	}

	.accept-btn {
		background: var(--color-success);
		color: white;
	}

	.accept-btn::before {
		background: rgba(255, 255, 255, 0.1);
	}

	.accept-btn:hover {
		transform: scale(1.05);
		box-shadow: 0 8px 24px rgba(34, 197, 94, 0.4);
	}

	.call-btn:focus {
		outline: none;
		ring: 2px solid var(--color-brand-primary);
	}

	/* Mobile responsiveness */
	@media (max-width: 480px) {
		.call-modal {
			margin: var(--space-4);
			min-width: auto;
			max-width: none;
			padding: var(--space-6);
		}

		.caller-avatar {
			width: 100px;
			height: 100px;
		}

		.avatar-placeholder {
			font-size: 2rem;
		}

		.caller-name {
			font-size: 1.25rem;
		}

		.call-actions {
			gap: var(--space-4);
		}

		.call-btn {
			width: 64px;
			height: 64px;
		}
	}
</style>