<script>
	import { onMount, onDestroy } from 'svelte';
	import { MLKEMCallManager, CALL_STATES } from '../../webrtc/ml-kem-call-manager.js';
	import { createEventDispatcher } from 'svelte';

	export let websocket = null;
	export let targetUser = null;

	const dispatch = createEventDispatcher();

	let callManager = null;
	let callState = CALL_STATES.IDLE;
	let localVideoElement = null;
	let remoteVideoElement = null;
	let localStream = null;
	let remoteStream = null;
	let incomingCall = null;
	let isVideoCall = false;
	let isEncrypted = false;
	let encryptionLevel = null;
	let callDuration = 0;
	let callTimer = null;

	// Call state reactive updates
	$: {
		if (callManager) {
			callManager.callState.subscribe(state => {
				callState = state;
				if (state === CALL_STATES.CONNECTED) {
					startCallTimer();
				} else if (state === CALL_STATES.ENDED || state === CALL_STATES.ERROR) {
					stopCallTimer();
				}
			});
		}
	}

	onMount(() => {
		if (websocket) {
			initializeCallManager();
			setupEventListeners();
		}
	});

	onDestroy(() => {
		cleanup();
	});

	function initializeCallManager() {
		callManager = new MLKEMCallManager(websocket);
		console.log('🔐 [CALL UI] Initialized ML-KEM call manager');
	}

	function setupEventListeners() {
		// Listen for incoming calls
		window.addEventListener('mlkem-call-incomingCall', handleIncomingCall);
		
		// Listen for remote stream
		window.addEventListener('mlkem-call-remoteStream', handleRemoteStream);
	}

	function handleIncomingCall(event) {
		console.log('🔐 [CALL UI] Incoming ML-KEM encrypted call:', event.detail);
		incomingCall = event.detail;
		isVideoCall = event.detail.payload.callType === 'video';
		
		// Show incoming call UI
		dispatch('incomingCall', {
			caller: event.detail.payload.fromName,
			isVideo: isVideoCall,
			isEncrypted: true,
			encryptionLevel: 'ML-KEM-1024'
		});
	}

	function handleRemoteStream(event) {
		console.log('🔐 [CALL UI] Received remote stream');
		remoteStream = event.detail;
		
		if (remoteVideoElement && remoteStream) {
			remoteVideoElement.srcObject = remoteStream;
		}

		// Update encryption status
		const callStateInfo = callManager.getCallState();
		isEncrypted = callStateInfo.isEncrypted;
		encryptionLevel = callStateInfo.encryptionLevel;
	}

	async function initiateCall(isVideo = false) {
		if (!callManager || !targetUser) {
			console.error('🔐 [CALL UI] Cannot initiate call: missing manager or target user');
			return;
		}

		try {
			isVideoCall = isVideo;
			await callManager.initiateCall(targetUser.id, isVideo);
			
			// Get local stream and display it
			const callStateInfo = callManager.getCallState();
			localStream = callStateInfo.localStream;
			
			if (localVideoElement && localStream) {
				localVideoElement.srcObject = localStream;
			}

			dispatch('callInitiated', {
				targetUser: targetUser.username,
				isVideo,
				isEncrypted: true,
				encryptionLevel: 'ML-KEM-1024'
			});

		} catch (error) {
			console.error('🔐 [CALL UI] Error initiating call:', error);
			dispatch('callError', { error: error.message });
		}
	}

	async function answerCall() {
		if (!callManager || !incomingCall) {
			console.error('🔐 [CALL UI] Cannot answer call: missing manager or incoming call');
			return;
		}

		try {
			await callManager.answerCall(incomingCall);
			
			// Get local stream and display it
			const callStateInfo = callManager.getCallState();
			localStream = callStateInfo.localStream;
			
			if (localVideoElement && localStream) {
				localVideoElement.srcObject = localStream;
			}

			incomingCall = null;
			dispatch('callAnswered', {
				isVideo: isVideoCall,
				isEncrypted: true,
				encryptionLevel: 'ML-KEM-1024'
			});

		} catch (error) {
			console.error('🔐 [CALL UI] Error answering call:', error);
			dispatch('callError', { error: error.message });
		}
	}

	async function declineCall() {
		if (incomingCall) {
			// Send decline message
			const declineMessage = {
				type: 'call_decline',
				payload: {
					callId: incomingCall.payload.callId
				},
				requestId: crypto.randomUUID(),
				timestamp: new Date().toISOString()
			};
			
			websocket.send(JSON.stringify(declineMessage));
			incomingCall = null;
			
			dispatch('callDeclined');
		}
	}

	async function endCall() {
		if (callManager) {
			// Track call ending with duration
			trackCallEnded({
				conversationId: targetUser?.id || 'unknown',
				callType: isVideoCall ? 'video' : 'voice',
				duration: callDuration
			});
			
			await callManager.endCall();
			cleanup();
			dispatch('callEnded');
		}
	}

	function toggleVideo() {
		if (localStream) {
			const videoTrack = localStream.getVideoTracks()[0];
			if (videoTrack) {
				videoTrack.enabled = !videoTrack.enabled;
			}
		}
	}

	function toggleAudio() {
		if (localStream) {
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack) {
				audioTrack.enabled = !audioTrack.enabled;
			}
		}
	}

	function startCallTimer() {
		callDuration = 0;
		callTimer = setInterval(() => {
			callDuration++;
		}, 1000);
	}

	function stopCallTimer() {
		if (callTimer) {
			clearInterval(callTimer);
			callTimer = null;
		}
		callDuration = 0;
	}

	function formatDuration(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	function cleanup() {
		stopCallTimer();
		
		if (localVideoElement) {
			localVideoElement.srcObject = null;
		}
		if (remoteVideoElement) {
			remoteVideoElement.srcObject = null;
		}
		
		localStream = null;
		remoteStream = null;
		incomingCall = null;
		isEncrypted = false;
		encryptionLevel = null;

		// Remove event listeners
		window.removeEventListener('mlkem-call-incomingCall', handleIncomingCall);
		window.removeEventListener('mlkem-call-remoteStream', handleRemoteStream);
	}

	// Expose functions for parent components
	export { initiateCall, answerCall, declineCall, endCall };
</script>

<!-- Incoming Call Modal -->
{#if incomingCall}
	<div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
		<div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
			<div class="text-center">
				<div class="mb-4">
					<div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
						<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
						</svg>
					</div>
					<h3 class="text-lg font-semibold text-gray-900">
						Incoming {isVideoCall ? 'Video' : 'Voice'} Call
					</h3>
					<p class="text-gray-600 mt-1">{incomingCall.payload.fromName}</p>
					
					<!-- Encryption Badge -->
					<div class="mt-3 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
						<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path>
						</svg>
						ML-KEM-1024 Encrypted
					</div>
				</div>
				
				<div class="flex space-x-4">
					<button
						on:click={declineCall}
						class="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
					>
						Decline
					</button>
					<button
						on:click={answerCall}
						class="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
					>
						Answer
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Active Call Interface -->
{#if callState !== CALL_STATES.IDLE && !incomingCall}
	<div class="fixed inset-0 bg-gray-900 flex flex-col z-40">
		<!-- Call Header -->
		<div class="bg-gray-800 p-4 flex items-center justify-between">
			<div class="flex items-center space-x-3">
				<div class="flex items-center space-x-2">
					<div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
					<span class="text-white font-medium">
						{#if callState === CALL_STATES.CONNECTING}
							Connecting...
						{:else if callState === CALL_STATES.CONNECTED}
							Connected - {formatDuration(callDuration)}
						{:else if callState === CALL_STATES.RINGING}
							Calling...
						{:else}
							{callState}
						{/if}
					</span>
				</div>
				
				<!-- Encryption Status -->
				{#if isEncrypted}
					<div class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-900 text-green-200">
						<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path>
						</svg>
						{encryptionLevel || 'ML-KEM-1024'}
					</div>
				{/if}
			</div>
			
			<button
				on:click={endCall}
				class="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-colors"
				aria-label="Close call interface"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
				</svg>
			</button>
		</div>

		<!-- Video Container -->
		<div class="flex-1 relative">
			{#if isVideoCall}
				<!-- Remote Video -->
				<video
					bind:this={remoteVideoElement}
					autoplay
					playsinline
					class="w-full h-full object-cover"
					aria-label="Remote participant video"
				>
					<track kind="captions" src="" label="No captions available" />
				</video>
				
				<!-- Local Video (Picture-in-Picture) -->
				<div class="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden">
					<video
						bind:this={localVideoElement}
						autoplay
						playsinline
						muted
						class="w-full h-full object-cover"
						aria-label="Your video"
					>
						<track kind="captions" src="" label="No captions available" />
					</video>
				</div>
			{:else}
				<!-- Audio Call UI -->
				<div class="flex items-center justify-center h-full">
					<div class="text-center text-white">
						<div class="w-32 h-32 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
							<svg class="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
							</svg>
						</div>
						<h2 class="text-xl font-semibold mb-2">
							{targetUser?.username || 'Unknown User'}
						</h2>
						<p class="text-gray-300">
							{callState === CALL_STATES.CONNECTED ? formatDuration(callDuration) : callState}
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Call Controls -->
		<div class="bg-gray-800 p-4">
			<div class="flex items-center justify-center space-x-6">
				<!-- Mute Audio -->
				<button
					on:click={toggleAudio}
					class="w-12 h-12 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center transition-colors"
					aria-label="Toggle microphone"
				>
					<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
					</svg>
				</button>

				<!-- End Call -->
				<button
					on:click={endCall}
					class="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
					aria-label="End call"
				>
					<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 3l1.664 1.664M21 21l-1.5-1.5m-5.485-1.242L12 17l-1.5-1.5m0 0L9 14l-1.5-1.5m0 0L6 11L4.5 9.5m0 0L3 8"></path>
					</svg>
				</button>

				<!-- Toggle Video (if video call) -->
				{#if isVideoCall}
					<button
						on:click={toggleVideo}
						class="w-12 h-12 bg-gray-600 hover:bg-gray-500 rounded-full flex items-center justify-center transition-colors"
						aria-label="Toggle camera"
					>
						<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
						</svg>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Ensure video elements fill their containers properly */
	video {
		background-color: #1f2937;
	}
</style>