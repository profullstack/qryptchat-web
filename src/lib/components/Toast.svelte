<script>
	import { onMount } from 'svelte';
	
	let { 
		type = 'info', 
		title = '', 
		message = '', 
		duration = 5000,
		onAccept = null,
		onDismiss = null,
		acceptText = 'Accept',
		dismissText = 'Dismiss',
		visible = false
	} = $props();
	
	let toastElement;
	let timeoutId = null;
	
	onMount(() => {
		if (visible && duration > 0) {
			timeoutId = setTimeout(() => {
				hide();
			}, duration);
		}
		
		return () => {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
		};
	});
	
	function hide() {
		visible = false;
		if (onDismiss) {
			onDismiss();
		}
	}
	
	function handleAccept() {
		visible = false;
		if (onAccept) {
			onAccept();
		}
	}
	
	function handleDismiss() {
		hide();
	}
	
	// Get styles based on type using $derived
	const typeClass = $derived(
		type === 'install' ? 'bg-indigo-600 border-indigo-500' :
		type === 'update' ? 'bg-emerald-600 border-emerald-500' :
		type === 'success' ? 'bg-green-600 border-green-500' :
		type === 'warning' ? 'bg-yellow-600 border-yellow-500' :
		type === 'error' ? 'bg-red-600 border-red-500' :
		'bg-blue-600 border-blue-500'
	);
	
	// Get icon based on type using $derived
	const icon = $derived(
		type === 'install' ? '📱' :
		type === 'update' ? '🔄' :
		type === 'success' ? '✓' :
		type === 'warning' ? '⚠' :
		type === 'error' ? '✕' :
		'🛈'
	);
</script>

{#if visible}
	<div 
		bind:this={toastElement}
		class="fixed top-4 right-4 z-50 max-w-sm w-full transform transition-all duration-300 ease-in-out"
		class:translate-x-0={visible}
		class:translate-x-full={!visible}
	>
		<div class="rounded-lg shadow-lg border-l-4 text-white p-4 {typeClass}">
			<div class="flex items-start">
				<div class="flex-shrink-0 text-xl mr-3">
					{icon}
				</div>
				<div class="flex-1 min-w-0">
					{#if title}
						<h3 class="font-semibold text-sm mb-1">{title}</h3>
					{/if}
					{#if message}
						<p class="text-sm opacity-90 leading-relaxed">{message}</p>
					{/if}
				</div>
				<button 
					onclick={handleDismiss}
					class="flex-shrink-0 ml-2 text-white/70 hover:text-white transition-colors"
					aria-label="Close notification"
				>
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
					</svg>
				</button>
			</div>
			
			{#if onAccept}
				<div class="flex gap-2 mt-3">
					<button 
						onclick={handleDismiss}
						class="px-3 py-1 text-xs bg-white/20 rounded hover:bg-white/30 transition-colors"
					>
						{dismissText}
					</button>
					<button 
						onclick={handleAccept}
						class="px-3 py-1 text-xs bg-white text-gray-900 rounded hover:bg-gray-100 transition-colors font-medium"
					>
						{acceptText}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Ensure toast appears above everything */
	:global(.toast-container) {
		z-index: 9999;
	}
</style>