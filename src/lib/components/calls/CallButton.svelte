<script>
	import { createEventDispatcher } from 'svelte';
	
	export let targetUser = null;
	export let disabled = false;
	export let size = 'md'; // 'sm', 'md', 'lg'
	
	const dispatch = createEventDispatcher();
	
	const sizeClasses = {
		sm: 'w-8 h-8 p-1',
		md: 'w-10 h-10 p-2',
		lg: 'w-12 h-12 p-3'
	};
	
	const iconSizes = {
		sm: 'w-4 h-4',
		md: 'w-5 h-5',
		lg: 'w-6 h-6'
	};
	
	function handleVoiceCall() {
		if (!disabled && targetUser) {
			dispatch('initiateCall', {
				targetUser,
				isVideo: false,
				encryption: 'ML-KEM-1024'
			});
		}
	}
	
	function handleVideoCall() {
		if (!disabled && targetUser) {
			dispatch('initiateCall', {
				targetUser,
				isVideo: true,
				encryption: 'ML-KEM-1024'
			});
		}
	}
</script>

<div class="flex items-center space-x-2">
	<!-- Voice Call Button -->
	<button
		on:click={handleVoiceCall}
		disabled={disabled || !targetUser}
		class="
			{sizeClasses[size]}
			bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed
			text-white rounded-full transition-colors duration-200
			flex items-center justify-center
			focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
		"
		title="Start encrypted voice call (ML-KEM-1024)"
	>
		<svg class="{iconSizes[size]}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
		</svg>
	</button>
	
	<!-- Video Call Button -->
	<button
		on:click={handleVideoCall}
		disabled={disabled || !targetUser}
		class="
			{sizeClasses[size]}
			bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed
			text-white rounded-full transition-colors duration-200
			flex items-center justify-center
			focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
		"
		title="Start encrypted video call (ML-KEM-1024)"
	>
		<svg class="{iconSizes[size]}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
		</svg>
	</button>
	
	<!-- Encryption Indicator -->
	{#if targetUser}
		<div class="flex items-center text-xs text-gray-500">
			<svg class="w-3 h-3 mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20">
				<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path>
			</svg>
			<span class="hidden sm:inline">ML-KEM</span>
		</div>
	{/if}
</div>