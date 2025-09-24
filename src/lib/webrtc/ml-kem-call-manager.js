/**
 * @fileoverview ML-KEM WebRTC Call Manager
 * Handles WebRTC calls with ML-KEM post-quantum encryption
 * Integrates with the ML-KEM cryptographic system for E2EE calls
 */

import { CallKeyExchange, MLKEMUtils } from '../crypto/ml-kem.js';
import { writable } from 'svelte/store';

/**
 * Call states for the ML-KEM call manager
 */
export const CALL_STATES = {
	IDLE: 'idle',
	INITIATING: 'initiating',
	RINGING: 'ringing',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	ENDED: 'ended',
	ERROR: 'error'
};

/**
 * ML-KEM WebRTC Call Manager
 * Manages encrypted voice/video calls with post-quantum cryptography
 */
export class MLKEMCallManager {
	constructor(websocket) {
		this.ws = websocket;
		this.callKeyExchange = new CallKeyExchange();
		this.mlkem = null; // Will be initialized during call setup
		
		// WebRTC components
		this.peerConnection = null;
		this.localStream = null;
		this.remoteStream = null;
		
		// Call state
		this.currentCall = null;
		this.callState = writable(CALL_STATES.IDLE);
		this.isVideoCall = false;
		
		// ML-KEM session data
		this.sessionId = null;
		this.keyPair = null;
		this.sharedSecret = null;
		this.derivedKeys = null;
		
		// WebRTC configuration
		this.rtcConfig = {
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' }
			]
		};
		
		this.setupWebSocketHandlers();
	}

	/**
	 * Setup WebSocket message handlers for ML-KEM calls
	 */
	setupWebSocketHandlers() {
		if (!this.ws) return;

		// Handle incoming ML-KEM call offers
		this.ws.addEventListener('message', async (event) => {
			try {
				const message = JSON.parse(event.data);
				
				switch (message.type) {
					case 'ml_kem_call_offer':
						await this.handleIncomingCallOffer(message);
						break;
					case 'ml_kem_call_answer':
						await this.handleCallAnswer(message);
						break;
					case 'call_ice_candidate':
						await this.handleIceCandidate(message);
						break;
					case 'call_end':
						await this.handleCallEnd(message);
						break;
				}
			} catch (error) {
				console.error('🔐 [CALL MANAGER] Error handling WebSocket message:', error);
			}
		});
	}

	/**
	 * Initiate an ML-KEM encrypted call
	 * @param {string} targetUserId - Target user ID
	 * @param {boolean} isVideo - Whether this is a video call
	 */
	async initiateCall(targetUserId, isVideo = false) {
		try {
			console.log('🔐 [CALL MANAGER] Initiating ML-KEM encrypted call to:', targetUserId);
			this.callState.set(CALL_STATES.INITIATING);
			this.isVideoCall = isVideo;

			// Initialize ML-KEM with 1024-bit security (no fallbacks)
			this.mlkem = this.callKeyExchange.negotiate(['ML_KEM_1024']);
			
			// Generate ML-KEM key pair
			this.keyPair = await this.mlkem.generateKeyPair();
			console.log('🔐 [CALL MANAGER] Generated ML-KEM-1024 key pair');

			// Get user media
			this.localStream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: isVideo
			});

			// Create peer connection
			this.peerConnection = new RTCPeerConnection(this.rtcConfig);
			this.setupPeerConnectionHandlers();

			// Add local stream to peer connection
			this.localStream.getTracks().forEach(track => {
				this.peerConnection.addTrack(track, this.localStream);
			});

			// Create SDP offer
			const offer = await this.peerConnection.createOffer();
			await this.peerConnection.setLocalDescription(offer);

			// Send ML-KEM call offer via WebSocket
			const callOfferMessage = {
				type: 'ml_kem_call_offer',
				payload: {
					targetUserId,
					callType: isVideo ? 'video' : 'voice',
					mlKemParams: ['ML_KEM_1024'], // Only support 1024
					initiatorPublicKey: MLKEMUtils.toBase64(this.keyPair.publicKey),
					sdpOffer: offer
				},
				requestId: crypto.randomUUID(),
				timestamp: new Date().toISOString()
			};

			this.ws.send(JSON.stringify(callOfferMessage));
			this.callState.set(CALL_STATES.RINGING);

		} catch (error) {
			console.error('🔐 [CALL MANAGER] Error initiating call:', error);
			this.callState.set(CALL_STATES.ERROR);
			throw error;
		}
	}

	/**
	 * Answer an incoming ML-KEM encrypted call
	 * @param {Object} callOffer - Incoming call offer
	 */
	async answerCall(callOffer) {
		try {
			console.log('🔐 [CALL MANAGER] Answering ML-KEM encrypted call');
			this.callState.set(CALL_STATES.CONNECTING);
			this.currentCall = callOffer;

			// Initialize ML-KEM with the negotiated parameter set
			this.mlkem = new (await import('../crypto/ml-kem.js')).MLKEMKeyExchange(
				callOffer.payload.mlKemParameterSet
			);

			// Generate our key pair
			this.keyPair = await this.mlkem.generateKeyPair();

			// Encapsulate using initiator's public key
			const initiatorPublicKey = MLKEMUtils.fromBase64(callOffer.payload.initiatorPublicKey);
			const { ciphertext, sharedSecret } = await this.mlkem.encapsulate(initiatorPublicKey);
			
			this.sharedSecret = sharedSecret;
			console.log('🔐 [CALL MANAGER] Generated shared secret via ML-KEM encapsulation');

			// Derive call keys
			this.derivedKeys = this.callKeyExchange.deriveCallKeys(
				this.sharedSecret, 
				callOffer.payload.callId
			);
			console.log('🔐 [CALL MANAGER] Derived SRTP/SFrame keys from ML-KEM shared secret');

			// Get user media
			this.localStream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: callOffer.payload.callType === 'video'
			});

			// Create peer connection
			this.peerConnection = new RTCPeerConnection(this.rtcConfig);
			this.setupPeerConnectionHandlers();

			// Add local stream
			this.localStream.getTracks().forEach(track => {
				this.peerConnection.addTrack(track, this.localStream);
			});

			// Set remote description from offer
			await this.peerConnection.setRemoteDescription(callOffer.payload.sdpOffer);

			// Create answer
			const answer = await this.peerConnection.createAnswer();
			await this.peerConnection.setLocalDescription(answer);

			// Send ML-KEM call answer
			const callAnswerMessage = {
				type: 'ml_kem_call_answer',
				payload: {
					callId: callOffer.payload.callId,
					sessionId: callOffer.payload.sessionId,
					recipientPublicKey: MLKEMUtils.toBase64(this.keyPair.publicKey),
					ciphertext: MLKEMUtils.toBase64(ciphertext),
					sdpAnswer: answer
				},
				requestId: crypto.randomUUID(),
				timestamp: new Date().toISOString()
			};

			this.ws.send(JSON.stringify(callAnswerMessage));

		} catch (error) {
			console.error('🔐 [CALL MANAGER] Error answering call:', error);
			this.callState.set(CALL_STATES.ERROR);
			throw error;
		}
	}

	/**
	 * Handle incoming call offer
	 * @param {Object} message - Call offer message
	 */
	async handleIncomingCallOffer(message) {
		console.log('🔐 [CALL MANAGER] Received ML-KEM call offer:', message);
		this.currentCall = message;
		this.callState.set(CALL_STATES.RINGING);
		
		// Emit event for UI to handle
		this.dispatchEvent('incomingCall', message);
	}

	/**
	 * Handle call answer
	 * @param {Object} message - Call answer message
	 */
	async handleCallAnswer(message) {
		try {
			console.log('🔐 [CALL MANAGER] Received ML-KEM call answer:', message);

			// Decapsulate to get shared secret
			const ciphertext = MLKEMUtils.fromBase64(message.payload.ciphertext);
			this.sharedSecret = await this.mlkem.decapsulate(ciphertext, this.keyPair.privateKey);
			console.log('🔐 [CALL MANAGER] Decapsulated shared secret via ML-KEM');

			// Derive call keys
			this.derivedKeys = this.callKeyExchange.deriveCallKeys(
				this.sharedSecret,
				message.payload.callId
			);
			console.log('🔐 [CALL MANAGER] Derived SRTP/SFrame keys from ML-KEM shared secret');

			// Set remote description
			await this.peerConnection.setRemoteDescription(message.payload.sdpAnswer);
			
			this.callState.set(CALL_STATES.CONNECTED);

		} catch (error) {
			console.error('🔐 [CALL MANAGER] Error handling call answer:', error);
			this.callState.set(CALL_STATES.ERROR);
		}
	}

	/**
	 * Handle ICE candidate
	 * @param {Object} message - ICE candidate message
	 */
	async handleIceCandidate(message) {
		try {
			if (this.peerConnection && message.payload.candidate) {
				await this.peerConnection.addIceCandidate(message.payload.candidate);
			}
		} catch (error) {
			console.error('🔐 [CALL MANAGER] Error handling ICE candidate:', error);
		}
	}

	/**
	 * Handle call end
	 * @param {Object} message - Call end message
	 */
	async handleCallEnd(message) {
		console.log('🔐 [CALL MANAGER] Call ended:', message);
		await this.endCall();
	}

	/**
	 * End the current call
	 */
	async endCall() {
		try {
			console.log('🔐 [CALL MANAGER] Ending call');

			// Send call end message
			if (this.currentCall && this.ws) {
				const callEndMessage = {
					type: 'call_end',
					payload: {
						callId: this.currentCall.payload?.callId
					},
					requestId: crypto.randomUUID(),
					timestamp: new Date().toISOString()
				};
				this.ws.send(JSON.stringify(callEndMessage));
			}

			// Clean up WebRTC
			if (this.peerConnection) {
				this.peerConnection.close();
				this.peerConnection = null;
			}

			// Stop local stream
			if (this.localStream) {
				this.localStream.getTracks().forEach(track => track.stop());
				this.localStream = null;
			}

			// Clear remote stream
			this.remoteStream = null;

			// Clear ML-KEM session data
			this.sessionId = null;
			this.keyPair = null;
			this.sharedSecret = null;
			this.derivedKeys = null;
			this.mlkem = null;

			// Reset state
			this.currentCall = null;
			this.callState.set(CALL_STATES.IDLE);

		} catch (error) {
			console.error('🔐 [CALL MANAGER] Error ending call:', error);
		}
	}

	/**
	 * Setup peer connection event handlers
	 */
	setupPeerConnectionHandlers() {
		if (!this.peerConnection) return;

		// Handle remote stream
		this.peerConnection.ontrack = (event) => {
			console.log('🔐 [CALL MANAGER] Received remote stream');
			this.remoteStream = event.streams[0];
			this.dispatchEvent('remoteStream', this.remoteStream);
		};

		// Handle ICE candidates
		this.peerConnection.onicecandidate = (event) => {
			if (event.candidate && this.currentCall) {
				const iceCandidateMessage = {
					type: 'call_ice_candidate',
					payload: {
						callId: this.currentCall.payload?.callId,
						targetUserId: this.currentCall.payload?.from,
						candidate: event.candidate
					},
					requestId: crypto.randomUUID(),
					timestamp: new Date().toISOString()
				};
				this.ws.send(JSON.stringify(iceCandidateMessage));
			}
		};

		// Handle connection state changes
		this.peerConnection.onconnectionstatechange = () => {
			console.log('🔐 [CALL MANAGER] Connection state:', this.peerConnection.connectionState);
			
			if (this.peerConnection.connectionState === 'connected') {
				this.callState.set(CALL_STATES.CONNECTED);
			} else if (this.peerConnection.connectionState === 'failed') {
				this.callState.set(CALL_STATES.ERROR);
			}
		};
	}

	/**
	 * Dispatch custom events
	 * @param {string} eventName - Event name
	 * @param {*} detail - Event detail
	 */
	dispatchEvent(eventName, detail) {
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent(`mlkem-call-${eventName}`, { detail }));
		}
	}

	/**
	 * Get current call state
	 * @returns {Object} Current call state
	 */
	getCallState() {
		return {
			state: this.callState,
			currentCall: this.currentCall,
			localStream: this.localStream,
			remoteStream: this.remoteStream,
			isEncrypted: !!this.sharedSecret,
			encryptionLevel: this.mlkem?.parameterSet || null
		};
	}
}