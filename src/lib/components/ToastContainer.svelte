<script>
	import { onMount } from 'svelte';
	
	let { 
		type = 'info', 
		title = '', 
		message = '', 
		onAccept = null,
		onDismiss = null,
		acceptText = 'Accept',
		dismissText = 'Dismiss',
		visible = false
	} = $props();
	
	function handleAccept() {
		visible = false;
		if (onAccept) {
			onAccept();
		}
	}
	
	function handleDismiss() {
		visible = false;
		if (onDismiss) {
			onDismiss();
		}
	}
	
	function getIcon(type) {
		switch (type) {
			case 'install': return '📱';
			case 'update': return '✨';
			case 'success': return '✅';
			case 'warning': return '⚠️';
			case 'error': return '❌';
			default: return 'ℹ️';
		}
	}
</script>

{#if visible}
	<div
		class="toast-container"
		class:toast-update={type === 'update'}
		class:toast-install={type === 'install'}
		role="alert"
		aria-live="assertive"
		aria-atomic="true"
	>
		<div class="toast-content">
			<!-- Enhanced visual indicator for updates -->
			<div class="toast-icon" class:pulse={type === 'update'}>
				{getIcon(type)}
			</div>
			
			<div class="toast-text">
				{#if title}
					<h3 class="toast-title">{title}</h3>
				{/if}
				{#if message}
					<p class="toast-message">{message}</p>
				{/if}
			</div>
			
			<button
				onclick={handleDismiss}
				class="toast-close"
				aria-label="Close notification"
				title="Close notification"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
				</svg>
			</button>
		</div>
		
		{#if onAccept}
			<div class="toast-actions">
				<button
					onclick={handleDismiss}
					class="toast-button toast-button-secondary"
					aria-label="Dismiss {title}"
				>
					{dismissText}
				</button>
				<button
					onclick={handleAccept}
					class="toast-button toast-button-primary"
					class:update-button={type === 'update'}
					aria-label="{acceptText} {title}"
				>
					{#if type === 'update'}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="update-icon">
							<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
						</svg>
					{:else if type === 'install'}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
						</svg>
					{/if}
					{acceptText}
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 1000;
		max-width: 400px;
		width: calc(100vw - 2rem);
		transform: translateX(100%);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		animation: slideInRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
	}

	@keyframes slideInRight {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.toast-content {
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: 0.75rem;
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
		backdrop-filter: blur(12px);
		padding: 1.25rem;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		position: relative;
		overflow: hidden;
	}

	.toast-update .toast-content {
		background: linear-gradient(135deg, var(--color-success) 0%, var(--color-success-dark, #059669) 100%);
		border-color: var(--color-success-light, #34d399);
		color: white;
	}

	.toast-install .toast-content {
		background: linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%);
		border-color: var(--color-primary-400);
		color: white;
	}

	.toast-content::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
		animation: shimmer 2s infinite;
	}

	@keyframes shimmer {
		0% { transform: translateX(-100%); }
		100% { transform: translateX(100%); }
	}

	.toast-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
	}

	.toast-icon.pulse {
		animation: iconPulse 2s infinite;
	}

	@keyframes iconPulse {
		0%, 100% {
			transform: scale(1);
			filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
		}
		50% {
			transform: scale(1.1);
			filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
		}
	}

	.toast-text {
		flex: 1;
		min-width: 0;
	}

	.toast-title {
		font-weight: 600;
		font-size: 0.875rem;
		margin: 0 0 0.25rem 0;
		color: inherit;
		line-height: 1.4;
	}

	.toast-message {
		font-size: 0.8125rem;
		margin: 0;
		opacity: 0.9;
		line-height: 1.4;
	}

	.toast-close {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.375rem;
		opacity: 0.7;
		transition: all 0.2s ease;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-close:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
		transform: scale(1.1);
	}

	.toast-close:focus {
		outline: 2px solid rgba(255, 255, 255, 0.5);
		outline-offset: 2px;
	}

	.toast-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
		align-items: center;
	}

	.toast-button {
		padding: 0.625rem 1rem;
		border-radius: 0.5rem;
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
		border: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.5rem;
		position: relative;
		overflow: hidden;
	}

	.toast-button:focus {
		outline: 2px solid rgba(255, 255, 255, 0.5);
		outline-offset: 2px;
	}

	.toast-button-secondary {
		background: rgba(255, 255, 255, 0.15);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.toast-button-secondary:hover {
		background: rgba(255, 255, 255, 0.25);
		transform: translateY(-1px);
	}

	.toast-button-primary {
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		font-weight: 600;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.toast-button-primary:hover {
		background: var(--color-bg-secondary);
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
	}

	.toast-button.update-button {
		background: var(--color-success);
		color: white;
		font-weight: 700;
		padding: 0.75rem 1.25rem;
		font-size: 0.9375rem;
		box-shadow:
			0 4px 12px rgba(16, 185, 129, 0.4),
			0 0 0 1px rgba(16, 185, 129, 0.1);
	}

	.toast-button.update-button:hover {
		background: var(--color-success-dark, #059669);
		transform: translateY(-2px);
		box-shadow:
			0 8px 20px rgba(16, 185, 129, 0.5),
			0 0 0 1px rgba(16, 185, 129, 0.2);
	}

	.toast-button.update-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
		animation: buttonShimmer 3s infinite;
	}

	@keyframes buttonShimmer {
		0% { left: -100%; }
		100% { left: 100%; }
	}

	.update-icon {
		animation: rotate 2s linear infinite;
	}

	@keyframes rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.toast-container {
			top: 0.5rem;
			right: 0.5rem;
			left: 0.5rem;
			max-width: none;
			width: auto;
		}

		.toast-content {
			padding: 1rem;
		}

		.toast-actions {
			flex-direction: column;
			gap: 0.5rem;
		}

		.toast-button {
			width: 100%;
			justify-content: center;
		}
	}

	/* High contrast mode support */
	@media (prefers-contrast: high) {
		.toast-content {
			border-width: 2px;
		}

		.toast-button {
			border-width: 2px;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.toast-container {
			animation: none;
			transform: translateX(0);
		}

		.toast-icon.pulse,
		.update-icon,
		.toast-content::before,
		.toast-button.update-button::before {
			animation: none;
		}
	}
</style>