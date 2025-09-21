<script>
	import { isInCall, currentCall, callStats, voiceCallManager } from '$lib/stores/voice-call.js';
	import { createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	let callData = null;

	// Subscribe to current call changes
	$: if ($isInCall && $currentCall) {
		callData = $currentCall;
	}

	/**
	 * End the current call
	 */
	async function endCall() {
		if (!callData?.id) return;
		
		try {
			await voiceCallManager.endCall(callData.id);
			dispatch('ended', { callId: callData.id });
		} catch (error) {
			console.error('Failed to end call:', error);
		}
	}

	/**
	 * Toggle mute state
	 */
	function toggleMute() {
		voiceCallManager.toggleMute();
	}

	/**
	 * Toggle video state (for video calls)
	 */
	function toggleVideo() {
		voiceCallManager.toggleVideo();
	}

	/**
	 * Format call duration from seconds to MM:SS
	 */
	function formatDuration(seconds) {
		return voiceCallManager.formatDuration(seconds);
	}
</script>

{#if $isInCall && callData}
	<!-- Active call overlay -->
	<div class="active-call-overlay" role="dialog" aria-modal="true" aria-labelledby="active-call-title">
		<div class="call-interface">
			<!-- Call header with participant info -->
			<div class="call-header">
				<div class="participant-info">
					<!-- Participant avatar -->
					<div class="participant-avatar">
						{#if callData.participantAvatar}
							<img src={callData.participantAvatar} alt={callData.participantName} />
						{:else}
							<div class="avatar-placeholder">
								{callData.participantName?.charAt(0)?.toUpperCase() || 'U'}
							</div>
						{/if}
					</div>

					<!-- Participant details -->
					<div class="participant-details">
						<h2 id="active-call-title" class="participant-name">
							{callData.participantName || 'Unknown User'}
						</h2>
						<div class="call-info">
							<span class="call-type">
								{#if callData.type === 'video'}
									<svg class="call-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polygon points="23 7 16 12 23 17 23 7"/>
										<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
									</svg>
									Video Call
								{:else}
									<svg class="call-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
									</svg>
									Voice Call
								{/if}
							</span>
							<span class="call-duration">
								{formatDuration($callStats.duration)}
							</span>
						</div>
					</div>
				</div>

				<!-- Call status -->
				<div class="call-status">
					{#if callData.state === 'connecting'}
						<span class="status-connecting">Connecting...</span>
					{:else if callData.state === 'connected'}
						<span class="status-connected">Connected</span>
					{/if}
				</div>
			</div>

			<!-- Video area (for video calls) -->
			{#if callData.type === 'video'}
				<div class="video-area">
					<div class="remote-video">
						<!-- Remote participant video would go here -->
						<div class="video-placeholder">
							<div class="participant-avatar-large">
								{#if callData.participantAvatar}
									<img src={callData.participantAvatar} alt={callData.participantName} />
								{:else}
									<div class="avatar-placeholder-large">
										{callData.participantName?.charAt(0)?.toUpperCase() || 'U'}
									</div>
								{/if}
							</div>
						</div>
					</div>
					
					<div class="local-video">
						<!-- Local user video would go here -->
						<div class="video-placeholder-small">
							<span class="local-video-label">You</span>
						</div>
					</div>
				</div>
			{/if}

			<!-- Call controls -->
			<div class="call-controls">
				<!-- Mute button -->
				<button 
					class="control-btn {callData.isMuted ? 'muted' : ''}" 
					on:click={toggleMute}
					aria-label={callData.isMuted ? 'Unmute microphone' : 'Mute microphone'}
				>
					{#if callData.isMuted}
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="1" y1="1" x2="23" y2="23"/>
							<path d="m9 9-4.5-4.5L5 5l-3-3m9.5 7.5V10a3 3 0 0 0-3-3m0 0L8 7"/>
							<path d="M14 9.3V10a3 3 0 0 1-.64 1.86L12 13"/>
							<path d="M12 17v4"/>
							<path d="M8 21h8"/>
						</svg>
					{:else}
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
							<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
							<line x1="12" y1="19" x2="12" y2="23"/>
							<line x1="8" y1="23" x2="16" y2="23"/>
						</svg>
					{/if}
				</button>

				<!-- Video toggle (for video calls) -->
				{#if callData.type === 'video'}
					<button 
						class="control-btn {callData.isVideoEnabled ? '' : 'video-disabled'}" 
						on:click={toggleVideo}
						aria-label={callData.isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
					>
						{#if callData.isVideoEnabled}
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<polygon points="23 7 16 12 23 17 23 7"/>
								<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
							</svg>
						{:else}
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="m16 16 6-6-6-6"/>
								<path d="m2 16 6-6-6-6"/>
								<line x1="1" y1="1" x2="23" y2="23"/>
							</svg>
						{/if}
					</button>
				{/if}

				<!-- End call button -->
				<button 
					class="control-btn end-call-btn" 
					on:click={endCall}
					aria-label="End call"
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
					</svg>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.active-call-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: var(--color-bg-primary);
		z-index: 999;
		display: flex;
		flex-direction: column;
		animation: call-interface-enter 0.3s ease-out;
	}

	@keyframes call-interface-enter {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.call-interface {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.call-header {
		background: var(--color-bg-secondary);
		padding: var(--space-6);
		border-bottom: 1px solid var(--color-border-primary);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.participant-info {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.participant-avatar {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		overflow: hidden;
		border: 2px solid var(--color-border-primary);
	}

	.participant-avatar img {
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
		font-size: 1.25rem;
		font-weight: 600;
	}

	.participant-details {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.participant-name {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin: 0;
	}

	.call-info {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.call-type {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.call-type-icon {
		color: var(--color-brand-primary);
	}

	.call-duration {
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.call-status {
		display: flex;
		align-items: center;
	}

	.status-connecting {
		color: var(--color-warning);
		font-size: 0.875rem;
		font-weight: 500;
		animation: pulse 2s ease-in-out infinite;
	}

	.status-connected {
		color: var(--color-success);
		font-size: 0.875rem;
		font-weight: 500;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	.video-area {
		flex: 1;
		position: relative;
		background: #000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remote-video {
		width: 100%;
		height: 100%;
		position: relative;
	}

	.video-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.participant-avatar-large {
		width: 200px;
		height: 200px;
		border-radius: 50%;
		overflow: hidden;
		border: 4px solid rgba(255, 255, 255, 0.2);
	}

	.participant-avatar-large img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder-large {
		width: 100%;
		height: 100%;
		background: rgba(255, 255, 255, 0.1);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 4rem;
		font-weight: 600;
		backdrop-filter: blur(10px);
	}

	.local-video {
		position: absolute;
		top: var(--space-4);
		right: var(--space-4);
		width: 200px;
		height: 150px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 2px solid rgba(255, 255, 255, 0.3);
		background: rgba(0, 0, 0, 0.5);
	}

	.video-placeholder-small {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
	}

	.local-video-label {
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.call-controls {
		background: var(--color-bg-secondary);
		padding: var(--space-6);
		border-top: 1px solid var(--color-border-primary);
		display: flex;
		justify-content: center;
		gap: var(--space-6);
	}

	.control-btn {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		border: 2px solid var(--color-border-primary);
	}

	.control-btn:hover {
		transform: scale(1.05);
		border-color: var(--color-brand-primary);
	}

	.control-btn:focus {
		outline: none;
		ring: 2px solid var(--color-brand-primary);
	}

	.control-btn.muted {
		background: var(--color-error);
		color: white;
		border-color: var(--color-error);
	}

	.control-btn.video-disabled {
		background: var(--color-warning);
		color: white;
		border-color: var(--color-warning);
	}

	.end-call-btn {
		background: var(--color-error);
		color: white;
		border-color: var(--color-error);
	}

	.end-call-btn:hover {
		background: var(--color-error-hover);
		border-color: var(--color-error-hover);
		box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
	}

	/* Mobile responsiveness */
	@media (max-width: 768px) {
		.call-header {
			padding: var(--space-4);
			flex-direction: column;
			gap: var(--space-3);
			align-items: flex-start;
		}

		.participant-avatar {
			width: 48px;
			height: 48px;
		}

		.avatar-placeholder {
			font-size: 1rem;
		}

		.participant-name {
			font-size: 1.125rem;
		}

		.call-info {
			font-size: 0.8125rem;
		}

		.participant-avatar-large {
			width: 150px;
			height: 150px;
		}

		.avatar-placeholder-large {
			font-size: 3rem;
		}

		.local-video {
			width: 120px;
			height: 90px;
			top: var(--space-3);
			right: var(--space-3);
		}

		.call-controls {
			padding: var(--space-4);
			gap: var(--space-4);
		}

		.control-btn {
			width: 48px;
			height: 48px;
		}
	}
</style>