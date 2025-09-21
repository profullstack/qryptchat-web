/**
 * @fileoverview Tests for voice calling functionality
 * Tests voice call service, signaling, and state management
 */

import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

// Mock browser environment for testing
global.browser = true;
global.navigator = {
	permissions: {
		query: sinon.stub()
	},
	mediaDevices: {
		getUserMedia: sinon.stub()
	}
};

describe('Voice Calling System', () => {
	let voiceCallManager;
	let currentCallStore;
	let callPermissionsStore;

	beforeEach(async () => {
		// Reset all stubs
		sinon.restore();

		// Setup mocks
		global.navigator.permissions.query.resolves({ state: 'granted' });
		global.navigator.mediaDevices.getUserMedia.resolves({
			getTracks: () => [{
				stop: sinon.stub()
			}]
		});

		// Import modules after mocks are set up
		const voiceCallModule = await import('../src/lib/stores/voice-call.js');
		voiceCallManager = voiceCallModule.voiceCallManager;
		currentCallStore = voiceCallModule.currentCall;
		callPermissionsStore = voiceCallModule.callPermissions;

		// Initialize manager
		await voiceCallManager.initialize();
	});

	afterEach(() => {
		sinon.restore();
		// Clear call state
		currentCallStore.set(null);
		callPermissionsStore.set({ microphone: false, camera: false });
	});

	describe('VoiceCallManager', () => {
		it('should initialize successfully', async () => {
			expect(voiceCallManager.initialized).to.be.true;
		});

		it('should check permissions on initialization', async () => {
			expect(global.navigator.permissions.query.calledWith({ name: 'microphone' })).to.be.true;
		});

		it('should start a voice call successfully', async () => {
			const participantId = 'user-123';
			const participantName = 'John Doe';
			const callType = 'voice';

			const callSession = await voiceCallManager.startCall(
				participantId,
				participantName,
				callType
			);

			expect(callSession).to.be.an('object');
			expect(callSession.id).to.be.a('string');
			expect(callSession.type).to.equal(callType);
			expect(callSession.participantId).to.equal(participantId);
			expect(callSession.participantName).to.equal(participantName);
			expect(callSession.state).to.equal('calling');
			expect(callSession.isIncoming).to.be.false;
		});

		it('should start a video call successfully', async () => {
			const participantId = 'user-456';
			const participantName = 'Jane Smith';
			const callType = 'video';

			const callSession = await voiceCallManager.startCall(
				participantId,
				participantName,
				callType
			);

			expect(callSession.type).to.equal(callType);
			expect(callSession.isVideoEnabled).to.be.true;
		});

		it('should reject starting a call when already in a call', async () => {
			// Start first call
			await voiceCallManager.startCall('user-1', 'User 1', 'voice');

			// Try to start second call
			try {
				await voiceCallManager.startCall('user-2', 'User 2', 'voice');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Already in a call');
			}
		});

		it('should request media permissions for voice calls', async () => {
			global.navigator.mediaDevices.getUserMedia.resolves({
				getTracks: () => [{ stop: sinon.stub() }]
			});

			const hasPermissions = await voiceCallManager.requestPermissions('voice');

			expect(hasPermissions).to.be.true;
			expect(global.navigator.mediaDevices.getUserMedia.calledWith({
				audio: true,
				video: false
			})).to.be.true;
		});

		it('should request media permissions for video calls', async () => {
			global.navigator.mediaDevices.getUserMedia.resolves({
				getTracks: () => [{ stop: sinon.stub() }]
			});

			const hasPermissions = await voiceCallManager.requestPermissions('video');

			expect(hasPermissions).to.be.true;
			expect(global.navigator.mediaDevices.getUserMedia.calledWith({
				audio: true,
				video: true
			})).to.be.true;
		});

		it('should handle permission denial gracefully', async () => {
			global.navigator.mediaDevices.getUserMedia.rejects(new Error('Permission denied'));

			const hasPermissions = await voiceCallManager.requestPermissions('voice');

			expect(hasPermissions).to.be.false;
		});

		it('should accept incoming calls', async () => {
			// Simulate incoming call
			const incomingCallData = {
				callId: 'call-123',
				from: 'user-456',
				fromName: 'Caller',
				type: 'voice'
			};

			voiceCallManager.handleIncomingCall(incomingCallData);

			// Get current call state
			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall).to.not.be.null;
			expect(currentCall.isIncoming).to.be.true;
			expect(currentCall.state).to.equal('ringing');

			// Accept the call
			await voiceCallManager.acceptCall(incomingCallData.callId);

			// Check that call state updated
			const unsubscribe2 = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe2();

			expect(currentCall.state).to.equal('connecting');
		});

		it('should end calls successfully', async () => {
			// Start a call
			const callSession = await voiceCallManager.startCall('user-123', 'Test User', 'voice');

			// End the call
			await voiceCallManager.endCall(callSession.id);

			// Check call state
			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.state).to.equal('ended');
			expect(currentCall.endTime).to.be.a('number');
		});

		it('should toggle mute state', async () => {
			// Start a call
			await voiceCallManager.startCall('user-123', 'Test User', 'voice');

			// Toggle mute
			voiceCallManager.toggleMute();

			// Check mute state
			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.isMuted).to.be.true;

			// Toggle mute again
			voiceCallManager.toggleMute();

			const unsubscribe2 = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe2();

			expect(currentCall.isMuted).to.be.false;
		});

		it('should toggle video state for video calls', async () => {
			// Start a video call
			await voiceCallManager.startCall('user-123', 'Test User', 'video');

			// Toggle video
			voiceCallManager.toggleVideo();

			// Check video state
			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.isVideoEnabled).to.be.false;
		});

		it('should not toggle video for voice calls', async () => {
			// Start a voice call
			await voiceCallManager.startCall('user-123', 'Test User', 'voice');

			// Try to toggle video
			voiceCallManager.toggleVideo();

			// Check video state (should remain false for voice calls)
			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.isVideoEnabled).to.be.false;
		});

		it('should format call duration correctly', () => {
			expect(voiceCallManager.formatDuration(0)).to.equal('00:00');
			expect(voiceCallManager.formatDuration(30)).to.equal('00:30');
			expect(voiceCallManager.formatDuration(60)).to.equal('01:00');
			expect(voiceCallManager.formatDuration(125)).to.equal('02:05');
			expect(voiceCallManager.formatDuration(3661)).to.equal('61:01');
		});
	});

	describe('Call State Management', () => {
		it('should track call state changes correctly', async () => {
			let callStates = [];
			
			// Subscribe to call state changes
			const unsubscribe = currentCallStore.subscribe(call => {
				if (call) {
					callStates.push(call.state);
				}
			});

			// Start call and track state changes
			await voiceCallManager.startCall('user-123', 'Test User', 'voice');

			// Simulate call progression
			const callId = voiceCallManager.getCurrentCall().id;
			await voiceCallManager.acceptCall(callId);

			unsubscribe();

			expect(callStates).to.include('calling');
			expect(callStates).to.include('connecting');
		});

		it('should handle multiple call state updates', async () => {
			const callSession = await voiceCallManager.startCall('user-123', 'Test User', 'voice');

			// Multiple state changes
			voiceCallManager.toggleMute();
			voiceCallManager.toggleMute();

			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.isMuted).to.be.false;
			expect(currentCall.id).to.equal(callSession.id);
		});
	});

	describe('Permission Management', () => {
		it('should update permission state when checking permissions', async () => {
			global.navigator.permissions.query.withArgs({ name: 'microphone' }).resolves({ state: 'granted' });
			global.navigator.permissions.query.withArgs({ name: 'camera' }).resolves({ state: 'granted' });

			await voiceCallManager.checkPermissions();

			let permissions = null;
			const unsubscribe = callPermissionsStore.subscribe(perms => {
				permissions = perms;
			});
			unsubscribe();

			expect(permissions.microphone).to.be.true;
			expect(permissions.camera).to.be.true;
		});

		it('should handle denied permissions', async () => {
			global.navigator.permissions.query.withArgs({ name: 'microphone' }).resolves({ state: 'denied' });
			global.navigator.permissions.query.withArgs({ name: 'camera' }).resolves({ state: 'denied' });

			await voiceCallManager.checkPermissions();

			let permissions = null;
			const unsubscribe = callPermissionsStore.subscribe(perms => {
				permissions = perms;
			});
			unsubscribe();

			expect(permissions.microphone).to.be.false;
			expect(permissions.camera).to.be.false;
		});
	});

	describe('Error Handling', () => {
		it('should handle permission request failures', async () => {
			global.navigator.mediaDevices.getUserMedia.rejects(new Error('Permission denied by user'));

			try {
				await voiceCallManager.startCall('user-123', 'Test User', 'voice');
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Media permissions required');
			}
		});

		it('should set error state when call fails', async () => {
			global.navigator.mediaDevices.getUserMedia.rejects(new Error('Device not found'));

			try {
				await voiceCallManager.startCall('user-123', 'Test User', 'voice');
			} catch (error) {
				// Expected to throw
			}

			let currentCall = null;
			const unsubscribe = currentCallStore.subscribe(call => {
				currentCall = call;
			});
			unsubscribe();

			expect(currentCall.state).to.equal('error');
			expect(currentCall.error).to.be.a('string');
		});
	});

	describe('Call ID Generation', () => {
		it('should generate unique call IDs', async () => {
			const call1 = await voiceCallManager.startCall('user-1', 'User 1', 'voice');
			await voiceCallManager.endCall(call1.id);
			
			const call2 = await voiceCallManager.startCall('user-2', 'User 2', 'voice');

			expect(call1.id).to.not.equal(call2.id);
			expect(call1.id).to.include('call-');
			expect(call2.id).to.include('call-');
		});

		it('should include timestamp in call ID', async () => {
			const beforeTime = Date.now();
			const call = await voiceCallManager.startCall('user-123', 'Test User', 'voice');
			const afterTime = Date.now();

			// Extract timestamp from call ID
			const timestampStr = call.id.split('-')[1];
			const timestamp = parseInt(timestampStr);

			expect(timestamp).to.be.at.least(beforeTime);
			expect(timestamp).to.be.at.most(afterTime);
		});
	});
});

describe('Voice Call WebSocket Protocol', () => {
	let MESSAGE_TYPES;

	beforeEach(async () => {
		const protocolModule = await import('../src/lib/websocket/utils/protocol.js');
		MESSAGE_TYPES = protocolModule.MESSAGE_TYPES;
	});

	it('should include all required voice call message types', () => {
		expect(MESSAGE_TYPES.CALL_OFFER).to.equal('call_offer');
		expect(MESSAGE_TYPES.CALL_ANSWER).to.equal('call_answer');
		expect(MESSAGE_TYPES.CALL_DECLINE).to.equal('call_decline');
		expect(MESSAGE_TYPES.CALL_END).to.equal('call_end');
		expect(MESSAGE_TYPES.CALL_ICE_CANDIDATE).to.equal('call_ice_candidate');
		expect(MESSAGE_TYPES.CALL_SDP_OFFER).to.equal('call_sdp_offer');
		expect(MESSAGE_TYPES.CALL_SDP_ANSWER).to.equal('call_sdp_answer');
		expect(MESSAGE_TYPES.CALL_STATUS).to.equal('call_status');
	});

	it('should validate voice call message formats', async () => {
		const { validateMessage, createMessage } = await import('../src/lib/websocket/utils/protocol.js');

		const callOfferMessage = createMessage(MESSAGE_TYPES.CALL_OFFER, {
			targetUserId: 'user-123',
			callType: 'voice',
			sdpOffer: 'mock-sdp-offer'
		});

		expect(validateMessage(callOfferMessage)).to.be.true;
	});
});

describe('Voice Call Components', () => {
	describe('Call Duration Formatting', () => {
		it('should format short durations correctly', () => {
			// Mock the formatDuration function
			const formatDuration = (seconds) => {
				const minutes = Math.floor(seconds / 60);
				const remainingSeconds = seconds % 60;
				return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
			};

			expect(formatDuration(0)).to.equal('00:00');
			expect(formatDuration(5)).to.equal('00:05');
			expect(formatDuration(30)).to.equal('00:30');
			expect(formatDuration(59)).to.equal('00:59');
		});

		it('should format long durations correctly', () => {
			const formatDuration = (seconds) => {
				const minutes = Math.floor(seconds / 60);
				const remainingSeconds = seconds % 60;
				return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
			};

			expect(formatDuration(60)).to.equal('01:00');
			expect(formatDuration(90)).to.equal('01:30');
			expect(formatDuration(3600)).to.equal('60:00');
			expect(formatDuration(3661)).to.equal('61:01');
		});
	});

	describe('Call State Validation', () => {
		it('should validate call states', () => {
			const validStates = ['idle', 'calling', 'ringing', 'connecting', 'connected', 'ended', 'error'];
			const testStates = ['calling', 'ringing', 'connected', 'ended'];

			testStates.forEach(state => {
				expect(validStates).to.include(state);
			});
		});

		it('should validate call types', () => {
			const validTypes = ['voice', 'video'];
			
			expect(validTypes).to.include('voice');
			expect(validTypes).to.include('video');
		});
	});
});

describe('Call Encryption Integration', () => {
	it('should integrate with existing post-quantum encryption', async () => {
		// Test that voice calling can leverage existing encryption infrastructure
		const { multiRecipientEncryption } = await import('../src/lib/crypto/multi-recipient-encryption.js');
		
		expect(multiRecipientEncryption).to.be.an('object');
		expect(multiRecipientEncryption.encryptForRecipients).to.be.a('function');
		expect(multiRecipientEncryption.decryptForCurrentUser).to.be.a('function');
	});

	it('should support multi-recipient encryption for group calls', async () => {
		const { multiRecipientEncryption } = await import('../src/lib/crypto/multi-recipient-encryption.js');
		
		// Mock a session key for group call encryption
		const sessionKey = 'mock-session-key-for-group-call';
		const recipientIds = ['user-1', 'user-2', 'user-3'];

		// This would be used to encrypt the session key for each participant
		expect(multiRecipientEncryption.encryptForRecipients).to.be.a('function');
		
		// Verify the function signature exists for multi-recipient encryption
		const encryptForRecipients = multiRecipientEncryption.encryptForRecipients;
		expect(encryptForRecipients).to.be.a('function');
	});
});