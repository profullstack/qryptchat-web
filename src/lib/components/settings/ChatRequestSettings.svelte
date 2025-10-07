<script>
	import { onMount } from 'svelte';
	let promptChatRequests = $state(false);
	let loading = $state(false);

	function handleToggle() {
		loading = true;
		// Simulate async save, replace with API call if needed
		setTimeout(() => {
			localStorage.setItem('promptChatRequests', promptChatRequests ? 'true' : 'false');
			loading = false;
		}, 500);
	}

	onMount(() => {
		const saved = localStorage.getItem('promptChatRequests');
		if (saved !== null) {
			promptChatRequests = saved === 'true';
		}
	});
</script>

<div class="setting-group">
	<h2>Chat Request Prompts</h2>
	<p>Require users to accept or reject new chat requests before starting a conversation.</p>
	<div class="setting-item">
		<label class="toggle-label">
			<input
				type="checkbox"
				bind:checked={promptChatRequests}
				onchange={handleToggle}
				disabled={loading}
				class="toggle-input"
			/>
			<span class="toggle-slider"></span>
			<span class="toggle-text">
				{promptChatRequests ? 'Prompt enabled' : 'Prompt disabled'}
			</span>
		</label>
	</div>
</div>

<style>
.setting-group {
	margin-bottom: 2rem;
}
.toggle-label {
	display: flex;
	align-items: center;
	gap: 1rem;
}
.toggle-input {
	width: 40px;
	height: 20px;
}
.toggle-slider {
	width: 40px;
	height: 20px;
	background: #e5e7eb;
	border-radius: 10px;
	position: relative;
	transition: background 0.2s;
}
.toggle-input:checked + .toggle-slider {
	background: #3b82f6;
}
.toggle-text {
	font-size: 1rem;
	color: #374151;
}
</style>
