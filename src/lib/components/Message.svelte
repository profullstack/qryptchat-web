<!--
  @fileoverview Message component for displaying info, warnings, errors, and success messages
  Provides consistent styling and behavior for all application messages
-->

<script>
	import { createEventDispatcher, onMount } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	/** @type {'info' | 'warning' | 'error' | 'success'} */
	export let type = 'info';
	
	/** @type {string} */
	export let message = '';
	
	/** @type {string} */
	export let title = '';
	
	/** @type {boolean} */
	export let dismissible = true;
	
	/** @type {number} Auto-dismiss after milliseconds (0 = no auto-dismiss) */
	export let autoDismiss = 0;
	
	/** @type {boolean} */
	export let visible = true;
	
	/** @type {string} Additional CSS classes */
	let className = '';
	export { className as class };
	
	/** @type {any} */
	let timeoutId = null;
	
	onMount(() => {
		if (autoDismiss > 0) {
			timeoutId = setTimeout(() => {
				handleDismiss();
			}, autoDismiss);
		}
		
		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	});
	
	function handleDismiss() {
		visible = false;
		dispatch('dismiss');
	}
	
	/**
	 * Get icon for message type
	 * @param {string} messageType
	 * @returns {string}
	 */
	function getIcon(messageType) {
		switch (messageType) {
			case 'success':
				return '✓';
			case 'error':
				return '✕';
			case 'warning':
				return '⚠';
			case 'info':
			default:
				return 'ℹ';
		}
	}
	
	/**
	 * Get CSS class for message type
	 * @param {string} messageType
	 * @returns {string}
	 */
	function getTypeClass(messageType) {
		switch (messageType) {
			case 'success':
				return 'message-success';
			case 'error':
				return 'message-error';
			case 'warning':
				return 'message-warning';
			case 'info':
			default:
				return 'message-info';
		}
	}
</script>

{#if visible && message}
	<div 
		class="message {getTypeClass(type)} {className}"
		role="alert"
		aria-live="polite"
	>
		<div class="message-content">
			<div class="message-icon">
				{getIcon(type)}
			</div>
			<div class="message-text">
				{#if title}
					<div class="message-title">{title}</div>
				{/if}
				<div class="message-body">{message}</div>
			</div>
		</div>
		
		{#if dismissible}
			<button 
				class="message-dismiss"
				on:click={handleDismiss}
				aria-label="Dismiss message"
			>
				×
			</button>
		{/if}
	</div>
{/if}

<style>
	.message {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.75rem;
		border-radius: 0.5rem;
		border: 1px solid;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		line-height: 1.5;
		transition: all 0.2s ease-in-out;
		animation: slideIn 0.3s ease-out;
	}
	
	.message-content {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		flex: 1;
	}
	
	.message-icon {
		font-size: 1rem;
		font-weight: bold;
		flex-shrink: 0;
		margin-top: 0.125rem;
	}
	
	.message-text {
		flex: 1;
	}
	
	.message-title {
		font-weight: 600;
		margin-bottom: 0.25rem;
	}
	
	.message-body {
		color: inherit;
	}
	
	.message-dismiss {
		background: none;
		border: none;
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		margin: 0;
		flex-shrink: 0;
		opacity: 0.7;
		transition: opacity 0.2s ease-in-out;
		color: inherit;
	}
	
	.message-dismiss:hover {
		opacity: 1;
	}
	
	.message-dismiss:focus {
		outline: 2px solid currentColor;
		outline-offset: 2px;
		border-radius: 2px;
	}
	
	/* Message type styles */
	.message-info {
		background-color: var(--color-primary-50, #eff6ff);
		border-color: var(--color-primary-200, #bfdbfe);
		color: var(--color-primary-700, #1d4ed8);
	}
	
	.message-success {
		background-color: var(--color-success-50, #f0fdf4);
		border-color: var(--color-success-200, #bbf7d0);
		color: var(--color-success-700, #15803d);
	}
	
	.message-warning {
		background-color: var(--color-warning-50, #fffbeb);
		border-color: var(--color-warning-200, #fed7aa);
		color: var(--color-warning-700, #b45309);
	}
	
	.message-error {
		background-color: var(--color-error-50, #fef2f2);
		border-color: var(--color-error-200, #fecaca);
		color: var(--color-error-700, #b91c1c);
	}
	
	/* Fallback colors if CSS variables aren't available */
	@supports not (color: var(--color-primary-50)) {
		.message-info {
			background-color: #eff6ff;
			border-color: #bfdbfe;
			color: #1d4ed8;
		}
		
		.message-success {
			background-color: #f0fdf4;
			border-color: #bbf7d0;
			color: #15803d;
		}
		
		.message-warning {
			background-color: #fffbeb;
			border-color: #fed7aa;
			color: #b45309;
		}
		
		.message-error {
			background-color: #fef2f2;
			border-color: #fecaca;
			color: #b91c1c;
		}
	}
	
	/* Animation for appearance */
	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>