/**
 * @fileoverview WebRTC service for QryptChat voice/video calling
 * Handles peer-to-peer connections, SDP negotiation, and media streams
 */

import 'webrtc-adapter';
import { browser } from '$app/environment';
import { currentCall, voiceCallManager } from '$lib/stores/voice-call.js';

/**
 * WebRTC configuration with STUN servers
 */
const RTC_CONFIGURATION = {
	iceServers: [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:stun1.l.google.com:19302' },
		{ urls: 'stun:stun2.l.google.com:19302' }
	],
	iceCandidatePoolSize: 10
};

/**
 * WebRTC service for managing voice/video calls
 */
export class WebRTCService {
	constructor() {
		this.peerConnection = null;
		this.localStream = null;
		this.remoteStream = null;
		this.currentCallId = null;
		this.wsConnection = null;
		this.isInitialized = false;
		
		// Bind methods to preserve context
		this.handleIceCandidate = this.handleIceCandidate.bind(this);
		this.handleRemoteStream = this.handleRemoteStream.bind(this);
		this.handleConnectionStateChange = this.handleConnectionStateChange.bind(this);
	}

	/**
	 * Initialize WebRTC service
	 * @param {WebSocket} wsConnection - WebSocket connection for signaling
	 */
	async initialize(wsConnection) {
		if (!browser || this.isInitialized) return;

		this.wsConnection = wsConnection;
		this.isInitialized = true;
		console.log('🎥 WebRTC service initialized');
	}

	/**
	 * Start a call as the caller
	 * @param {string} callId - Call ID
	 * @param {string} targetUserId - Target user ID
	 * @param {string} callType - Call type (voice or video)
	 */
	async startCall(callId, targetUserId, callType = 'voice') {
		try {
			console.log(`🎥 Starting WebRTC ${callType} call:`, { callId, targetUserId });

			this.currentCallId = callId;

			// Create peer connection
			await this.createPeerConnection();

			// Get user media
			await this.getUserMedia(callType);

			// Create and send offer
			const offer = await this.peerConnection.createOffer();
			await this.peerConnection.setLocalDescription(offer);

			// Send offer via WebSocket signaling
			this.sendSignalingMessage('CALL_SDP_OFFER', {
				callId,
				targetUserId,
				sdp: offer
			});

			console.log('🎥 WebRTC offer sent');

		} catch (error) {
			console.error('🎥 Failed to start WebRTC call:', error);
			await this.cleanup();
			throw error;
		}
	}

	/**
	 * Answer a call as the recipient
	 * @param {string} callId - Call ID
	 * @param {string} targetUserId - Caller's user ID
	 * @param {string} callType - Call type (voice or video)
	 * @param {Object} offer - SDP offer from caller
	 */
	async answerCall(callId, targetUserId, callType = 'voice', offer) {
		try {
			console.log(`🎥 Answering WebRTC ${callType} call:`, { callId, targetUserId });

			this.currentCallId = callId;

			// Create peer connection
			await this.createPeerConnection();

			// Get user media
			await this.getUserMedia(callType);

			// Set remote description (offer)
			await this.peerConnection.setRemoteDescription(offer);

			// Create and send answer
			const answer = await this.peerConnection.createAnswer();
			await this.peerConnection.setLocalDescription(answer);

			// Send answer via WebSocket signaling
			this.sendSignalingMessage('CALL_SDP_ANSWER', {
				callId,
				targetUserId,
				sdp: answer
			});

			console.log('🎥 WebRTC answer sent');

		} catch (error) {
			console.error('🎥 Failed to answer WebRTC call:', error);
			await this.cleanup();
			throw error;
		}
	}

	/**
	 * Handle incoming SDP answer
	 * @param {Object} answer - SDP answer from recipient
	 */
	async handleAnswer(answer) {
		try {
			console.log('🎥 Handling WebRTC answer');
			await this.peerConnection.setRemoteDescription(answer);
		} catch (error) {
			console.error('🎥 Failed to handle WebRTC answer:', error);
			throw error;
		}
	}

	/**
	 * Handle incoming ICE candidate
	 * @param {Object} candidate - ICE candidate
	 */
	async handleIceCandidateMessage(candidate) {
		try {
			console.log('🎥 Adding ICE candidate');
			await this.peerConnection.addIceCandidate(candidate);
		} catch (error) {
			console.error('🎥 Failed to add ICE candidate:', error);
		}
	}

	/**
	 * End the current call
	 */
	async endCall() {
		try {
			console.log('🎥 Ending WebRTC call');
			await this.cleanup();
		} catch (error) {
			console.error('🎥 Failed to end WebRTC call:', error);
		}
	}

	/**
	 * Toggle mute state for local audio
	 */
	toggleMute() {
		if (!this.localStream) return;

		const audioTrack = this.localStream.getAudioTracks()[0];
		if (audioTrack) {
			audioTrack.enabled = !audioTrack.enabled;
			console.log(`🎥 Audio ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
		}
	}

	/**
	 * Toggle video state for local video
	 */
	toggleVideo() {
		if (!this.localStream) return;

		const videoTrack = this.localStream.getVideoTracks()[0];
		if (videoTrack) {
			videoTrack.enabled = !videoTrack.enabled;
			console.log(`🎥 Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
		}
	}

	/**
	 * Get local video element for displaying user's video
	 * @returns {HTMLVideoElement|null}
	 */
	getLocalVideoElement() {
		if (!browser) return null;
		return document.getElementById('local-video');
	}

	/**
	 * Get remote video element for displaying peer's video
	 * @returns {HTMLVideoElement|null}
	 */
	getRemoteVideoElement() {
		if (!browser) return null;
		return document.getElementById('remote-video');
	}

	/**
	 * Create RTCPeerConnection with event handlers
	 * @private
	 */
	async createPeerConnection() {
		try {
			this.peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

			// Set up event handlers
			this.peerConnection.onicecandidate = this.handleIceCandidate;
			this.peerConnection.ontrack = this.handleRemoteStream;
			this.peerConnection.onconnectionstatechange = this.handleConnectionStateChange;

			console.log('🎥 WebRTC peer connection created');
		} catch (error) {
			console.error('🎥 Failed to create peer connection:', error);
			throw error;
		}
	}

	/**
	 * Get user media stream
	 * @param {string} callType - Call type (voice or video)
	 * @private
	 */
	async getUserMedia(callType) {
		try {
			const constraints = {
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				video: callType === 'video' ? {
					width: { ideal: 1280 },
					height: { ideal: 720 },
					frameRate: { ideal: 30 }
				} : false
			};

			this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

			// Add tracks to peer connection
			this.localStream.getTracks().forEach(track => {
				this.peerConnection.addTrack(track, this.localStream);
			});

			// Display local video if video call
			if (callType === 'video') {
				const localVideo = this.getLocalVideoElement();
				if (localVideo) {
					localVideo.srcObject = this.localStream;
				}
			}

			console.log(`🎥 Got user media for ${callType} call`);
		} catch (error) {
			console.error('🎥 Failed to get user media:', error);
			throw error;
		}
	}

	/**
	 * Handle ICE candidate events
	 * @param {RTCPeerConnectionIceEvent} event
	 * @private
	 */
	handleIceCandidate(event) {
		if (event.candidate && this.currentCallId) {
			console.log('🎥 Sending ICE candidate');
			
			// Get target user ID from current call
			let targetUserId = null;
			const unsubscribe = currentCall.subscribe(call => {
				if (call) {
					targetUserId = call.participantId;
				}
			});
			unsubscribe();

			if (targetUserId) {
				this.sendSignalingMessage('CALL_ICE_CANDIDATE', {
					callId: this.currentCallId,
					targetUserId,
					candidate: event.candidate
				});
			}
		}
	}

	/**
	 * Handle remote stream events
	 * @param {RTCTrackEvent} event
	 * @private
	 */
	handleRemoteStream(event) {
		console.log('🎥 Received remote stream');
		
		this.remoteStream = event.streams[0];

		// Display remote video
		const remoteVideo = this.getRemoteVideoElement();
		if (remoteVideo) {
			remoteVideo.srcObject = this.remoteStream;
		}
	}

	/**
	 * Handle connection state changes
	 * @param {Event} event
	 * @private
	 */
	handleConnectionStateChange(event) {
		if (!this.peerConnection) return;

		const state = this.peerConnection.connectionState;
		console.log('🎥 WebRTC connection state:', state);

		switch (state) {
			case 'connected':
				console.log('🎥 WebRTC connection established');
				break;
			case 'disconnected':
				console.log('🎥 WebRTC connection disconnected');
				break;
			case 'failed':
				console.error('🎥 WebRTC connection failed');
				this.cleanup();
				break;
			case 'closed':
				console.log('🎥 WebRTC connection closed');
				break;
		}
	}

	/**
	 * Send signaling message via WebSocket
	 * @param {string} messageType - Message type
	 * @param {Object} payload - Message payload
	 * @private
	 */
	sendSignalingMessage(messageType, payload) {
		if (!this.wsConnection || this.wsConnection.readyState !== WebSocket.OPEN) {
			console.error('🎥 WebSocket not connected for signaling');
			return;
		}

		const message = {
			type: messageType,
			payload,
			requestId: `webrtc-${Date.now()}`,
			timestamp: new Date().toISOString()
		};

		this.wsConnection.send(JSON.stringify(message));
		console.log(`🎥 Sent signaling message: ${messageType}`);
	}

	/**
	 * Clean up WebRTC resources
	 * @private
	 */
	async cleanup() {
		console.log('🎥 Cleaning up WebRTC resources');

		// Stop local stream tracks
		if (this.localStream) {
			this.localStream.getTracks().forEach(track => {
				track.stop();
			});
			this.localStream = null;
		}

		// Clear video elements
		const localVideo = this.getLocalVideoElement();
		const remoteVideo = this.getRemoteVideoElement();
		
		if (localVideo) {
			localVideo.srcObject = null;
		}
		if (remoteVideo) {
			remoteVideo.srcObject = null;
		}

		// Close peer connection
		if (this.peerConnection) {
			this.peerConnection.close();
			this.peerConnection = null;
		}

		this.remoteStream = null;
		this.currentCallId = null;
	}

	/**
	 * Get connection statistics
	 * @returns {Promise<Object>} Connection statistics
	 */
	async getStats() {
		if (!this.peerConnection) return null;

		try {
			const stats = await this.peerConnection.getStats();
			const result = {
				connectionState: this.peerConnection.connectionState,
				iceConnectionState: this.peerConnection.iceConnectionState,
				iceGatheringState: this.peerConnection.iceGatheringState,
				localCandidates: 0,
				remoteCandidates: 0,
				bytesSent: 0,
				bytesReceived: 0
			};

			stats.forEach(report => {
				if (report.type === 'local-candidate') {
					result.localCandidates++;
				} else if (report.type === 'remote-candidate') {
					result.remoteCandidates++;
				} else if (report.type === 'outbound-rtp') {
					result.bytesSent += report.bytesSent || 0;
				} else if (report.type === 'inbound-rtp') {
					result.bytesReceived += report.bytesReceived || 0;
				}
			});

			return result;
		} catch (error) {
			console.error('🎥 Failed to get WebRTC stats:', error);
			return null;
		}
	}

	/**
	 * Check if WebRTC is supported
	 * @returns {boolean} Whether WebRTC is supported
	 */
	static isSupported() {
		return !!(
			browser &&
			window.RTCPeerConnection &&
			navigator.mediaDevices &&
			navigator.mediaDevices.getUserMedia
		);
	}
}

/**
 * WebRTC call manager - integrates WebRTC with voice call store
 */
class WebRTCCallManager {
	constructor() {
		this.webrtcService = new WebRTCService();
		this.currentCall = null;
		this.wsConnection = null;
		
		// Subscribe to call state changes
		if (browser) {
			currentCall.subscribe(call => {
				this.handleCallStateChange(call);
			});
		}
	}

	/**
	 * Initialize with WebSocket connection
	 * @param {WebSocket} wsConnection - WebSocket connection
	 */
	async initialize(wsConnection) {
		this.wsConnection = wsConnection;
		await this.webrtcService.initialize(wsConnection);
		
		// Set up WebSocket message handlers for WebRTC signaling
		this.setupWebSocketHandlers();
	}

	/**
	 * Handle call state changes from voice call store
	 * @param {Object} call - Current call data
	 * @private
	 */
	async handleCallStateChange(call) {
		if (!call) {
			// Call ended or cleared
			if (this.currentCall) {
				await this.webrtcService.cleanup();
				this.currentCall = null;
			}
			return;
		}

		// Skip if same call
		if (this.currentCall?.id === call.id) return;

		this.currentCall = call;

		// Handle different call states
		switch (call.state) {
			case 'calling':
				if (!call.isIncoming) {
					// We're the caller - start WebRTC
					await this.webrtcService.startCall(call.id, call.participantId, call.type);
				}
				break;
			case 'connecting':
				if (call.isIncoming) {
					// We're answering - WebRTC answer will be handled by WebSocket messages
					console.log('🎥 Preparing to answer WebRTC call');
				}
				break;
			case 'ended':
				await this.webrtcService.cleanup();
				break;
		}
	}

	/**
	 * Set up WebSocket message handlers for WebRTC signaling
	 * @private
	 */
	setupWebSocketHandlers() {
		if (!this.wsConnection) return;

		// Store original onmessage handler
		const originalHandler = this.wsConnection.onmessage;

		this.wsConnection.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				
				// Handle WebRTC signaling messages
				switch (message.type) {
					case 'call_sdp_offer':
						this.handleSdpOffer(message.payload);
						break;
					case 'call_sdp_answer':
						this.handleSdpAnswer(message.payload);
						break;
					case 'call_ice_candidate':
						this.handleIceCandidate(message.payload);
						break;
					default:
						// Pass other messages to original handler
						if (originalHandler) {
							originalHandler.call(this.wsConnection, event);
						}
						break;
				}
			} catch (error) {
				console.error('🎥 Failed to handle WebSocket message:', error);
				// Pass to original handler as fallback
				if (originalHandler) {
					originalHandler.call(this.wsConnection, event);
				}
			}
		};
	}

	/**
	 * Handle incoming SDP offer
	 * @param {Object} payload - Message payload
	 * @private
	 */
	async handleSdpOffer(payload) {
		const { callId, sdp } = payload;
		
		if (callId === this.currentCall?.id && this.currentCall?.isIncoming) {
			await this.webrtcService.answerCall(
				callId,
				this.currentCall.participantId,
				this.currentCall.type,
				sdp
			);
		}
	}

	/**
	 * Handle incoming SDP answer
	 * @param {Object} payload - Message payload
	 * @private
	 */
	async handleSdpAnswer(payload) {
		const { callId, sdp } = payload;
		
		if (callId === this.currentCall?.id && !this.currentCall?.isIncoming) {
			await this.webrtcService.handleAnswer(sdp);
		}
	}

	/**
	 * Handle incoming ICE candidate
	 * @param {Object} payload - Message payload
	 * @private
	 */
	async handleIceCandidate(payload) {
		const { callId, candidate } = payload;
		
		if (callId === this.currentCall?.id) {
			await this.webrtcService.handleIceCandidateMessage(candidate);
		}
	}

	/**
	 * Toggle mute - integrates with voice call store
	 */
	toggleMute() {
		this.webrtcService.toggleMute();
		voiceCallManager.toggleMute();
	}

	/**
	 * Toggle video - integrates with voice call store
	 */
	toggleVideo() {
		this.webrtcService.toggleVideo();
		voiceCallManager.toggleVideo();
	}

	/**
	 * Get call statistics
	 * @returns {Promise<Object>} Call statistics
	 */
	async getStats() {
		return await this.webrtcService.getStats();
	}
}

// Export singleton instance
export const webrtcCallManager = new WebRTCCallManager();

// Export WebRTC service class for testing
export { WebRTCService };