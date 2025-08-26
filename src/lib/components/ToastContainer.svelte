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
	
	function getTypeClass(type) {
		switch (type) {
			case 'install': return 'bg-gradient-to-br from-indigo-600 to-indigo-700 border-indigo-400/50';
			case 'update': return 'bg-gradient-to-br from-emerald-600 to-emerald-700 border-emerald-400/50';
			case 'success': return 'bg-gradient-to-br from-green-600 to-green-700 border-green-400/50';
			case 'warning': return 'bg-gradient-to-br from-yellow-600 to-yellow-700 border-yellow-400/50';
			case 'error': return 'bg-gradient-to-br from-red-600 to-red-700 border-red-400/50';
			default: return 'bg-gradient-to-br from-blue-600 to-blue-700 border-blue-400/50';
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
	<div class="fixed bottom-4 left-4 z-50 max-w-sm w-full transform transition-all duration-500 ease-out animate-in slide-in-from-left-5 fade-in">
		<div class="rounded-xl shadow-2xl backdrop-blur-sm border text-white p-5 {getTypeClass(type)} relative overflow-hidden">
			<!-- Animated background gradient -->
			<div class="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-50"></div>
			
			<!-- Pulse animation for update type -->
			{#if type === 'update'}
				<div class="absolute inset-0 bg-gradient-to-r from-emerald-400/20 to-emerald-600/20 animate-pulse"></div>
			{/if}
			
			<div class="relative z-10">
				<div class="flex items-start">
					<div class="flex-shrink-0 text-2xl mr-4 animate-bounce">
						{getIcon(type)}
					</div>
					<div class="flex-1 min-w-0">
						{#if title}
							<h3 class="font-bold text-base mb-2 text-white drop-shadow-sm">{title}</h3>
						{/if}
						{#if message}
							<p class="text-sm text-white/90 leading-relaxed font-medium">{message}</p>
						{/if}
					</div>
					<button
						onclick={handleDismiss}
						class="flex-shrink-0 ml-3 text-white/60 hover:text-white transition-all duration-200 hover:scale-110 rounded-full p-1 hover:bg-white/20"
						aria-label="Close notification"
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
						</svg>
					</button>
				</div>
				
				{#if onAccept}
					<div class="flex gap-3 mt-4">
						<button
							onclick={handleDismiss}
							class="px-4 py-2 text-sm bg-white/20 rounded-lg hover:bg-white/30 transition-all duration-200 font-medium backdrop-blur-sm border border-white/30 hover:scale-105"
						>
							{dismissText}
						</button>
						<button
							onclick={handleAccept}
							class="px-4 py-2 text-sm bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-all duration-200 font-bold shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
						>
							{#if type === 'update'}
								<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
								</svg>
							{:else if type === 'install'}
								<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
									<path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"></path>
								</svg>
							{/if}
							{acceptText}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}