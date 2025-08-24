<script>
	let { users = [] } = $props();

	const typingText = $derived(() => {
		if (users.length === 0) return '';
		if (users.length === 1) return `${users[0].display_name || users[0].username} is typing...`;
		if (users.length === 2) return `${users[0].display_name || users[0].username} and ${users[1].display_name || users[1].username} are typing...`;
		return `${users.length} people are typing...`;
	});
</script>

{#if users.length > 0}
	<div class="typing-indicator">
		<div class="typing-avatar">
			<div class="typing-dots">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</div>
		<div class="typing-text">
			{typingText}
		</div>
	</div>
{/if}

<style>
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		margin-bottom: 0.5rem;
		opacity: 0.8;
	}

	.typing-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.typing-dots {
		display: flex;
		gap: 2px;
	}

	.typing-dots span {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--color-text-secondary);
		animation: typing-bounce 1.4s infinite ease-in-out;
	}

	.typing-dots span:nth-child(1) {
		animation-delay: -0.32s;
	}

	.typing-dots span:nth-child(2) {
		animation-delay: -0.16s;
	}

	.typing-text {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	@keyframes typing-bounce {
		0%, 80%, 100% {
			transform: scale(0.8);
			opacity: 0.5;
		}
		40% {
			transform: scale(1);
			opacity: 1;
		}
	}
</style>