<script>
	import { onMount } from 'svelte';
	import { 
		createOptimizedVideoElement, 
		attemptVideoPlaybackFix,
		generateVideoDiagnosticReport 
	} from '$lib/utils/video-diagnostics.js';

	let {
		src,
		mimeType = '',
		filename = 'video',
		controls = true,
		autoplay = false,
		loop = false,
		muted = false,
		poster = null,
		onError = null,
		onLoadStart = null,
		onCanPlay = null
	} = $props();

	let videoContainer = $state(null);
	let videoElement = $state(null);
	let isLoading = $state(true);
	let hasError = $state(false);
	let errorMessage = $state('');
	let diagnosticReport = $state(null);
	let showDiagnostics = $state(false);

	onMount(async () => {
		if (!src || !videoContainer) return;

		try {
			// Create optimized video element
			videoElement = createOptimizedVideoElement(src, {
				controls,
				preload: 'metadata',
				disablePiP: false
			});

			// Set additional attributes
			if (autoplay) videoElement.autoplay = true;
			if (loop) videoElement.loop = true;
			if (muted) videoElement.muted = true;
			if (poster) videoElement.poster = poster;

			// Add custom event listeners
			videoElement.addEventListener('loadstart', () => {
				isLoading = true;
				hasError = false;
				onLoadStart?.();
			});

			videoElement.addEventListener('canplay', () => {
				isLoading = false;
				onCanPlay?.();
			});

			videoElement.addEventListener('error', async (e) => {
				console.error('Video error occurred:', e);
				hasError = true;
				isLoading = false;
				
				const target = e.target;
				if (target?.error) {
					errorMessage = `Video Error (${target.error.code}): ${target.error.message}`;
				} else {
					errorMessage = 'Unknown video playback error';
				}

				// Try to apply fixes
				console.log('Attempting to fix video playback...');
				const fixesApplied = await attemptVideoPlaybackFix(videoElement);
				
				if (fixesApplied) {
					console.log('Video fixes applied, retrying playback...');
					// Small delay before retry
					setTimeout(() => {
						videoElement.load();
					}, 1000);
				}

				onError?.(e);
			});

			// Add video to container
			videoContainer.appendChild(videoElement);

		} catch (error) {
			console.error('Error setting up video player:', error);
			hasError = true;
			errorMessage = 'Failed to initialize video player';
		}
	});

	async function generateDiagnostics() {
		try {
			diagnosticReport = await generateVideoDiagnosticReport();
			showDiagnostics = true;
		} catch (error) {
			console.error('Error generating diagnostics:', error);
		}
	}

	function closeDiagnostics() {
		showDiagnostics = false;
	}

	function downloadDiagnostics() {
		if (!diagnosticReport) return;
		
		const blob = new Blob([JSON.stringify(diagnosticReport, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `video-diagnostics-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="enhanced-video-player">
	{#if isLoading}
		<div class="video-loading">
			<div class="loading-spinner"></div>
			<span>Loading video...</span>
		</div>
	{/if}

	{#if hasError}
		<div class="video-error">
			<div class="error-icon">⚠️</div>
			<div class="error-content">
				<h4>Video Playback Error</h4>
				<p>{errorMessage}</p>
				<div class="error-actions">
					<button class="btn-retry" onclick={() => videoElement?.load()}>
						Retry
					</button>
					<button class="btn-diagnostics" onclick={generateDiagnostics}>
						Run Diagnostics
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="video-container" bind:this={videoContainer} class:hidden={isLoading || hasError}>
		<!-- Video element will be inserted here -->
	</div>

	{#if showDiagnostics && diagnosticReport}
		<div class="diagnostics-modal">
			<div class="modal-backdrop" onclick={closeDiagnostics}></div>
			<div class="modal-content">
				<div class="modal-header">
					<h3>Video Diagnostics Report</h3>
					<button class="close-btn" onclick={closeDiagnostics}>×</button>
				</div>
				
				<div class="modal-body">
					<div class="diagnostic-section">
						<h4>Environment</h4>
						<ul>
							<li><strong>PWA Mode:</strong> {diagnosticReport.environment.isPWA ? 'Yes' : 'No'}</li>
							<li><strong>Display Mode:</strong> {diagnosticReport.environment.displayMode}</li>
							<li><strong>Platform:</strong> {diagnosticReport.environment.platform}</li>
						</ul>
					</div>

					<div class="diagnostic-section">
						<h4>Codec Support</h4>
						<ul>
							<li><strong>H.264 (MP4):</strong> {diagnosticReport.codecSupport.mp4_h264 ? '✅' : '❌'}</li>
							<li><strong>VP8 (WebM):</strong> {diagnosticReport.codecSupport.webm_vp8 ? '✅' : '❌'}</li>
							<li><strong>VP9 (WebM):</strong> {diagnosticReport.codecSupport.webm_vp9 ? '✅' : '❌'}</li>
							<li><strong>AV1 (WebM):</strong> {diagnosticReport.codecSupport.webm_av1 ? '✅' : '❌'}</li>
						</ul>
					</div>

					<div class="diagnostic-section">
						<h4>Hardware Acceleration</h4>
						<p><strong>Available:</strong> {diagnosticReport.hardwareAcceleration.available ? '✅ Yes' : '❌ No'}</p>
						{#if diagnosticReport.hardwareAcceleration.renderer}
							<p><strong>Renderer:</strong> {diagnosticReport.hardwareAcceleration.renderer}</p>
						{/if}
					</div>

					{#if diagnosticReport.recommendations.length > 0}
						<div class="diagnostic-section">
							<h4>Recommendations</h4>
							<ul>
								{#each diagnosticReport.recommendations as recommendation}
									<li>{recommendation}</li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<div class="modal-footer">
					<button class="btn-download" onclick={downloadDiagnostics}>
						Download Report
					</button>
					<button class="btn-close" onclick={closeDiagnostics}>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.enhanced-video-player {
		position: relative;
		width: 100%;
		background: var(--color-surface);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	.video-container {
		width: 100%;
		min-height: 200px;
	}

	.video-container.hidden {
		display: none;
	}

	.video-container :global(video) {
		width: 100%;
		height: auto;
		display: block;
	}

	.video-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		gap: 1rem;
		color: var(--color-text-secondary);
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top: 3px solid var(--color-brand-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.video-error {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: var(--color-error-background, #fef2f2);
		color: var(--color-error-text, #dc2626);
		border: 1px solid var(--color-error-border, #fecaca);
	}

	.error-icon {
		font-size: 2rem;
		flex-shrink: 0;
	}

	.error-content {
		flex: 1;
	}

	.error-content h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.error-content p {
		margin: 0 0 1rem 0;
		font-size: 0.9rem;
		opacity: 0.8;
	}

	.error-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-retry,
	.btn-diagnostics {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 0.25rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-retry {
		background: var(--color-brand-primary);
		color: white;
	}

	.btn-retry:hover {
		background: var(--color-brand-secondary);
	}

	.btn-diagnostics {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn-diagnostics:hover {
		background: var(--color-surface-hover);
	}

	.diagnostics-modal {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
	}

	.modal-content {
		position: relative;
		background: var(--color-background);
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
		max-width: 600px;
		width: 100%;
		max-height: 80vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.diagnostic-section {
		margin-bottom: 2rem;
	}

	.diagnostic-section:last-child {
		margin-bottom: 0;
	}

	.diagnostic-section h4 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--color-brand-primary);
	}

	.diagnostic-section ul {
		margin: 0;
		padding-left: 1.5rem;
		list-style: disc;
	}

	.diagnostic-section li {
		margin-bottom: 0.5rem;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.diagnostic-section p {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		padding: 1.5rem;
		border-top: 1px solid var(--color-border);
		justify-content: flex-end;
	}

	.btn-download,
	.btn-close {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-download {
		background: var(--color-brand-primary);
		color: white;
	}

	.btn-download:hover {
		background: var(--color-brand-secondary);
	}

	.btn-close {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	.btn-close:hover {
		background: var(--color-surface-hover);
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	@media (max-width: 640px) {
		.diagnostics-modal {
			padding: 0.5rem;
		}

		.modal-content {
			max-height: 90vh;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding: 1rem;
		}

		.error-actions {
			flex-direction: column;
		}

		.modal-footer {
			flex-direction: column;
		}
	}
</style>