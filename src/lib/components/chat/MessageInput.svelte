<script>
	import { onMount } from 'svelte';
	import { chat } from '$lib/stores/chat.js';
	import { user } from '$lib/stores/auth.js';

	let { conversationId = null, disabled = false } = $props();

	let messageText = $state('');
	let textareaElement = $state(/** @type {HTMLTextAreaElement | null} */ (null));
	let isSending = $state(false);
	let typingTimeout = $state(/** @type {NodeJS.Timeout | null} */ (null));

	const currentUser = $derived($user);

	// Auto-resize textarea
	$effect(() => {
		if (textareaElement && messageText !== undefined) {
			textareaElement.style.height = 'auto';
			textareaElement.style.height = Math.min(textareaElement.scrollHeight, 120) + 'px';
		}
	});

	async function sendMessage() {
		if (!messageText.trim() || !conversationId || !currentUser?.id || isSending) return;

		const content = messageText.trim();
		messageText = '';
		isSending = true;

		try {
			const result = await chat.sendMessage({
				conversation_id: conversationId,
				message_type: 'text',
				encrypted_content: content, // TODO: Add encryption
				metadata: {}
			}, currentUser.id);

			if (!result.success) {
				console.error('Failed to send message:', result.error);
				// Restore message text on failure
				messageText = content;
			}
		} catch (error) {
			console.error('Error sending message:', error);
			// Restore message text on failure
			messageText = content;
		} finally {
			isSending = false;
			// Focus back to textarea
			if (textareaElement) {
				textareaElement.focus();
			}
		}
	}

	function handleKeyDown(/** @type {KeyboardEvent} */ event) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	function handleInput() {
		// Handle typing indicators
		if (conversationId && currentUser?.id) {
			// Clear existing timeout
			if (typingTimeout) {
				clearTimeout(typingTimeout);
			}

			// Set typing indicator
			chat.setTypingIndicator(conversationId, currentUser.id, true);

			// Clear typing indicator after 3 seconds of inactivity
			typingTimeout = setTimeout(() => {
				if (conversationId && currentUser?.id) {
					chat.setTypingIndicator(conversationId, currentUser.id, false);
				}
			}, 3000);
		}
	}

	function handlePaste(/** @type {ClipboardEvent} */ event) {
		// TODO: Handle file uploads from clipboard
		const items = event.clipboardData?.items;
		if (items) {
			for (const item of items) {
				if (item.type.startsWith('image/')) {
					event.preventDefault();
					// TODO: Handle image upload
					console.log('Image paste detected - implement file upload');
					break;
				}
			}
		}
	}

	onMount(() => {
		// Focus textarea on mount
		if (textareaElement) {
			textareaElement.focus();
		}

		// Cleanup typing indicator on unmount
		return () => {
			if (typingTimeout) {
				clearTimeout(typingTimeout);
			}
			if (conversationId && currentUser?.id) {
				chat.setTypingIndicator(conversationId, currentUser.id, false);
			}
		};
	});
</script>

<div class="message-input-container">
	<div class="message-input">
		<div class="input-wrapper">
			<textarea
				bind:this={textareaElement}
				bind:value={messageText}
				placeholder={disabled ? 'Select a conversation to start messaging' : 'Type a message...'}
				{disabled}
				rows="1"
				onkeydown={handleKeyDown}
				oninput={handleInput}
				onpaste={handlePaste}
			></textarea>
			
			<div class="input-actions">
				<button
					type="button"
					class="attach-button"
					{disabled}
					title="Attach file"
					aria-label="Attach file"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
					</svg>
				</button>
				
				<button
					type="button"
					class="send-button"
					class:sending={isSending}
					disabled={disabled || !messageText.trim() || isSending}
					onclick={sendMessage}
					title="Send message"
				>
					{#if isSending}
						<div class="sending-spinner"></div>
					{:else}
						<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
							<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.message-input-container {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.message-input {
		max-width: 100%;
	}

	.input-wrapper {
		display: flex;
		align-items: flex-end;
		gap: 0.75rem;
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 1.5rem;
		padding: 0.75rem 1rem;
		transition: border-color 0.2s ease;
	}

	.input-wrapper:focus-within {
		border-color: var(--color-primary-500);
	}

	textarea {
		flex: 1;
		border: none;
		outline: none;
		background: transparent;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		line-height: 1.4;
		resize: none;
		min-height: 20px;
		max-height: 120px;
		font-family: inherit;
	}

	textarea::placeholder {
		color: var(--color-text-secondary);
	}

	textarea:disabled {
		color: var(--color-text-secondary);
		cursor: not-allowed;
	}

	.input-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.attach-button,
	.send-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
		background: transparent;
		color: var(--color-text-secondary);
	}

	.attach-button:hover:not(:disabled) {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.send-button {
		background: var(--color-primary-500);
		color: white;
	}

	.send-button:hover:not(:disabled) {
		background: var(--color-primary-600);
		transform: scale(1.05);
	}

	.send-button:disabled {
		background: var(--color-border);
		color: var(--color-text-secondary);
		cursor: not-allowed;
		transform: none;
	}

	.send-button.sending {
		background: var(--color-primary-400);
		cursor: not-allowed;
	}

	.sending-spinner {
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

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.message-input-container {
			padding: 0.75rem;
		}

		.input-wrapper {
			padding: 0.625rem 0.875rem;
		}

		.attach-button,
		.send-button {
			width: 32px;
			height: 32px;
		}

		textarea {
			font-size: 16px; /* Prevent zoom on iOS */
		}
	}
</style>