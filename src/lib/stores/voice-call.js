/**
 * @fileoverview Voice call store for QryptChat
 * Manages voice/video call state and provides reactive call management
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Current call session
 */
export const currentCall = writable(null);

/**
 * Call permissions state
 */
export const callPermissions = writable({
	microphone: false,
	camera: false
});

/**
 * Call statistics
 */
export const callStats = writable({
	duration: 0,
	quality: 'unknown'
});

/**
 * Derived store for call status
 */
export const isInCall = derived(
	currentCall,
	($currentCall) => $currentCall?.state === 'connected'
);

/**
 * Derived store for incoming call
 */
export const hasIncomingCall = derived(
	currentCall,
	($currentCall) => $currentCall?.isIncoming && $currentCall?.state === 'ringing'
);

/**
 * Derived store for call in progress
 */
export const isCallInProgress = derived(
	currentCall,
	($currentCall) => $currentCall && ['calling', 'ringing', 'connecting', 'connected'].includes($currentCall.state)
);

/**
 * Voice call manager class
 */
class VoiceCallManager {
	constructor() {
		this.callDurationInterval = null;
		this.initialized = false;
	}

	/**
	 * Initialize the voice call manager
	 */
	async initialize() {
		if (!browser || this.initialized) return;

		try {
			// Check for media permissions
			await this.checkPermissions();
			this.initialized = true;
			console.log('📞 Voice call manager initialized');
		} catch (error) {
			console.error('📞 Failed to initialize voice call manager:', error);
		}
	}

	/**
	 * Check and request media permissions
	 */
	async checkPermissions() {
		try {
			// Check microphone permission
			const micPermission = await navigator.permissions.query({ name: 'microphone' });
			const micGranted = micPermission.state === 'granted';

			// Check camera permission
			let cameraGranted = false;
			try {
				const cameraPermission = await navigator.permissions.query({ name: 'camera' });
				cameraGranted = cameraPermission.state === 'granted';
			} catch (e) {
				// Camera permission might not be available
				console.warn('📞 Camera permission check not available');
			}

			callPermissions.set({
				microphone: micGranted,
				camera: cameraGranted
			});

			return { microphone: micGranted, camera: cameraGranted };
		} catch (error) {
			console.error('📞 Permission check failed:', error);
			return { microphone: false, camera: false };
		}
	}

	/**
	 * Request media permissions
	 * @param {string} callType - Type of call (voice or video)
	 */
	async requestPermissions(callType = 'voice') {
		try {
			const constraints = {
				audio: true,
				video: callType === 'video'
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			
			// Stop the test stream immediately
			stream.getTracks().forEach(track => track.stop());

			// Update permissions
			await this.checkPermissions();
			
			return true;
		} catch (error) {
			console.error('📞 Permission request failed:', error);
			return false;
		}
	}

	/**
	 * Start a new call
	 * @param {string} participantId - Participant user ID
	 * @param {string} participantName - Participant display name
	 * @param {string} callType - Call type (voice or video)
	 * @param {string} participantAvatar - Participant avatar URL
	 */
	async startCall(participantId, participantName, callType = 'voice', participantAvatar = null) {
		try {
			// Check if already in a call
			const current = this.getCurrentCall();
			if (current && current.state !== 'idle' && current.state !== 'ended') {
				throw new Error('Already in a call');
			}

			// Request permissions first
			const hasPermissions = await this.requestPermissions(callType);
			if (!hasPermissions) {
				throw new Error('Media permissions required for calls');
			}

			// Generate call ID
			const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

			// Create call session
			const callSession = {
				id: callId,
				type: callType,
				participantId,
				participantName,
				participantAvatar,
				state: 'calling',
				isIncoming: false,
				isMuted: false,
				isVideoEnabled: callType === 'video',
				startTime: Date.now(),
				endTime: null,
				error: null
			};

			currentCall.set(callSession);
			
			console.log(`📞 Starting ${callType} call with ${participantName}`, callSession);

			// TODO: Implement WebRTC signaling
			// This would send a call offer through the WebSocket connection

			return callSession;
		} catch (error) {
			console.error('📞 Failed to start call:', error);
			
			// Set error state
			const errorMessage = error instanceof Error ? error.message : String(error);
			currentCall.update(call => {
				if (!call) return null;
				return { ...call, state: 'error', error: errorMessage };
			});
			
			throw error;
		}
	}

	/**
	 * Accept an incoming call
	 * @param {string} callId - Call ID to accept
	 */
	async acceptCall(callId) {
		const current = this.getCurrentCall();
		if (!current || current.id !== callId || !current.isIncoming) {
			throw new Error('Invalid call to accept');
		}

		try {
			// Request permissions
			const hasPermissions = await this.requestPermissions(current.type);
			if (!hasPermissions) {
				throw new Error('Media permissions required for calls');
			}

			// Update call state
			currentCall.update(call => {
				if (!call) return null;
				return { ...call, state: 'connecting' };
			});

			console.log('📞 Accepting call:', callId);

			// TODO: Implement WebRTC answer signaling

			// Simulate connection for now
			setTimeout(() => {
				currentCall.update(call => {
					if (!call) return null;
					return { ...call, state: 'connected' };
				});
				this.startCallTimer();
			}, 1000);

		} catch (error) {
			console.error('📞 Failed to accept call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			currentCall.update(call => {
				if (!call) return null;
				return { ...call, state: 'error', error: errorMessage };
			});
		}
	}

	/**
	 * Decline or end a call
	 * @param {string} callId - Call ID to end
	 */
	async endCall(callId) {
		const current = this.getCurrentCall();
		if (!current || current.id !== callId) {
			console.warn('📞 No active call to end');
			return;
		}

		try {
			console.log('📞 Ending call:', callId);

			// Stop call timer
			this.stopCallTimer();

			// Update call state
			currentCall.update(call => {
				if (!call) return null;
				return { ...call, state: 'ended', endTime: Date.now() };
			});

			// TODO: Implement WebRTC cleanup and signaling

			// Clear call after a delay
			setTimeout(() => {
				currentCall.set(null);
			}, 3000);

		} catch (error) {
			console.error('📞 Failed to end call:', error);
		}
	}

	/**
	 * Toggle mute state
	 */
	toggleMute() {
		currentCall.update(call => {
			if (!call) return null;
			
			const newMutedState = !call.isMuted;
			console.log(`📞 ${newMutedState ? 'Muting' : 'Unmuting'} microphone`);
			
			// TODO: Mute/unmute audio track in WebRTC
			
			return { ...call, isMuted: newMutedState };
		});
	}

	/**
	 * Toggle video state (for video calls)
	 */
	toggleVideo() {
		currentCall.update(call => {
			if (!call || call.type === 'voice') return call;
			
			const newVideoState = !call.isVideoEnabled;
			console.log(`📞 ${newVideoState ? 'Enabling' : 'Disabling'} video`);
			
			// TODO: Enable/disable video track in WebRTC
			
			return { ...call, isVideoEnabled: newVideoState };
		});
	}

	/**
	 * Handle incoming call
	 * @param {object} callData - Incoming call data
	 */
	handleIncomingCall(callData) {
		console.log('📞 Incoming call:', callData);

		const callSession = {
			id: callData.callId || `call-${Date.now()}`,
			type: callData.type || 'voice',
			participantId: callData.from || '',
			participantName: callData.fromName || 'Unknown',
			participantAvatar: callData.fromAvatar || null,
			state: 'ringing',
			isIncoming: true,
			isMuted: false,
			isVideoEnabled: (callData.type || 'voice') === 'video',
			startTime: Date.now(),
			endTime: null,
			error: null
		};

		currentCall.set(callSession);
	}

	/**
	 * Start call duration timer
	 * @private
	 */
	startCallTimer() {
		if (this.callDurationInterval) {
			clearInterval(this.callDurationInterval);
		}

		const startTime = Date.now();
		this.callDurationInterval = setInterval(() => {
			const duration = Math.floor((Date.now() - startTime) / 1000);
			callStats.update(stats => ({ ...stats, duration }));
		}, 1000);
	}

	/**
	 * Stop call duration timer
	 * @private
	 */
	stopCallTimer() {
		if (this.callDurationInterval) {
			clearInterval(this.callDurationInterval);
			this.callDurationInterval = null;
		}
	}

	/**
	 * Get current call session
	 * @returns {object|null}
	 */
	getCurrentCall() {
		let current = null;
		const unsubscribe = currentCall.subscribe(call => {
			current = call;
		});
		unsubscribe();
		return current;
	}

	/**
	 * Format call duration
	 * @param {number} seconds - Duration in seconds
	 * @returns {string} Formatted duration (MM:SS)
	 */
	formatDuration(seconds) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
	}
}

// Export singleton instance
export const voiceCallManager = new VoiceCallManager();

// Auto-initialize in browser
if (browser) {
	voiceCallManager.initialize();
}