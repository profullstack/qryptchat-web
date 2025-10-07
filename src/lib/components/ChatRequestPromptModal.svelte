<script>
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	let isOpen = true;

	function accept() {
		dispatch('accept');
		isOpen = false;
	}
	function reject() {
		dispatch('reject');
		isOpen = false;
	}
</script>

{#if isOpen}
<div class="modal-overlay">
	<div class="modal-container">
		<h2>Chat Request</h2>
		<p>Do you want to accept this chat request?</p>
		<div class="actions">
			<button class="accept" on:click={accept}>Accept</button>
			<button class="reject" on:click={reject}>Reject</button>
		</div>
	</div>
</div>
{/if}

<style>
.modal-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0,0,0,0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
}
.modal-container {
	background: white;
	border-radius: 12px;
	padding: 2rem;
	box-shadow: 0 8px 32px rgba(0,0,0,0.2);
	text-align: center;
	min-width: 300px;
}
.actions {
	display: flex;
	gap: 1rem;
	justify-content: center;
	margin-top: 1.5rem;
}
.accept {
	background: #3b82f6;
	color: white;
	border: none;
	padding: 0.5rem 1.5rem;
	border-radius: 6px;
	font-weight: 500;
	cursor: pointer;
}
.reject {
	background: #e5e7eb;
	color: #374151;
	border: none;
	padding: 0.5rem 1.5rem;
	border-radius: 6px;
	font-weight: 500;
	cursor: pointer;
}
</style>
