/**
 * @fileoverview Call Audio Manager
 * Handles ringing sounds and call audio notifications
 */

/**
 * Call Audio Manager
 * Manages audio notifications for ML-KEM encrypted calls
 */
export class CallAudioManager {
	constructor() {
		this.ringingAudio = null;
		this.isRinging = false;
		this.audioContext = null;
		
		// Initialize audio context on user interaction
		this.initializeAudio();
	}

	/**
	 * Initialize audio context (requires user interaction)
	 */
	async initializeAudio() {
		try {
			// Create audio context on first user interaction
			if (!this.audioContext && typeof window !== 'undefined') {
				// Wait for user interaction before creating audio context
				const initAudio = () => {
					if (!this.audioContext) {
						this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
						this.createRingingTone();
					}
					document.removeEventListener('click', initAudio);
					document.removeEventListener('touchstart', initAudio);
				};
				
				document.addEventListener('click', initAudio);
				document.addEventListener('touchstart', initAudio);
			}
		} catch (error) {
			console.warn('🔊 [AUDIO] Could not initialize audio context:', error);
		}
	}

	/**
	 * Create a synthetic ringing tone using Web Audio API
	 */
	createRingingTone() {
		if (!this.audioContext) return;

		try {
			// Create a simple ringing tone pattern
			const duration = 2; // 2 seconds
			const sampleRate = this.audioContext.sampleRate;
			const buffer = this.audioContext.createBuffer(1, duration * sampleRate, sampleRate);
			const data = buffer.getChannelData(0);

			// Generate a pleasant ringing tone (two-tone pattern)
			for (let i = 0; i < buffer.length; i++) {
				const time = i / sampleRate;
				const freq1 = 440; // A4 note
				const freq2 = 554; // C#5 note
				
				// Create a pattern: tone1 for 0.4s, silence for 0.1s, tone2 for 0.4s, silence for 1.1s
				let amplitude = 0;
				const cycleTime = time % 2;
				
				if (cycleTime < 0.4) {
					amplitude = 0.1 * Math.sin(2 * Math.PI * freq1 * time);
				} else if (cycleTime >= 0.5 && cycleTime < 0.9) {
					amplitude = 0.1 * Math.sin(2 * Math.PI * freq2 * time);
				}
				
				// Apply fade in/out to avoid clicks
				const fadeTime = 0.05;
				if (cycleTime < fadeTime) {
					amplitude *= cycleTime / fadeTime;
				} else if (cycleTime > 0.4 - fadeTime && cycleTime < 0.4) {
					amplitude *= (0.4 - cycleTime) / fadeTime;
				} else if (cycleTime > 0.5 && cycleTime < 0.5 + fadeTime) {
					amplitude *= (cycleTime - 0.5) / fadeTime;
				} else if (cycleTime > 0.9 - fadeTime && cycleTime < 0.9) {
					amplitude *= (0.9 - cycleTime) / fadeTime;
				}
				
				data[i] = amplitude;
			}

			// Create audio source
			this.ringingBuffer = buffer;
		} catch (error) {
			console.warn('🔊 [AUDIO] Could not create ringing tone:', error);
		}
	}

	/**
	 * Start playing ringing sound
	 */
	startRinging() {
		if (this.isRinging) return;

		try {
			this.isRinging = true;
			console.log('🔊 [AUDIO] Starting ringing sound');

			if (this.audioContext && this.ringingBuffer) {
				this.playRingingLoop();
			} else {
				// Fallback: try to use HTML5 audio with a data URL
				this.playFallbackRinging();
			}
		} catch (error) {
			console.warn('🔊 [AUDIO] Could not start ringing:', error);
		}
	}

	/**
	 * Play ringing sound in a loop using Web Audio API
	 */
	playRingingLoop() {
		if (!this.isRinging || !this.audioContext || !this.ringingBuffer) return;

		try {
			const source = this.audioContext.createBufferSource();
			source.buffer = this.ringingBuffer;
			source.connect(this.audioContext.destination);
			source.start();

			// Schedule next ring
			source.onended = () => {
				if (this.isRinging) {
					setTimeout(() => this.playRingingLoop(), 500); // 0.5s pause between rings
				}
			};

			this.currentSource = source;
		} catch (error) {
			console.warn('🔊 [AUDIO] Error playing ringing loop:', error);
		}
	}

	/**
	 * Fallback ringing using HTML5 Audio (less reliable but broader support)
	 */
	playFallbackRinging() {
		try {
			// Create a simple beep sound using data URL
			const beepFreq = 800;
			const beepDuration = 0.3;
			const sampleRate = 8000;
			const samples = beepDuration * sampleRate;
			const buffer = new ArrayBuffer(samples * 2);
			const view = new DataView(buffer);

			for (let i = 0; i < samples; i++) {
				const sample = Math.sin(2 * Math.PI * beepFreq * i / sampleRate) * 0.3;
				const intSample = Math.max(-32767, Math.min(32767, Math.floor(sample * 32767)));
				view.setInt16(i * 2, intSample, true);
			}

			// Convert to base64 and create audio element
			const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
			const dataUrl = `data:audio/wav;base64,${base64}`;
			
			this.ringingAudio = new Audio();
			this.ringingAudio.loop = true;
			this.ringingAudio.volume = 0.3;
			
			// Note: This is a simplified approach. A proper WAV header would be needed for full compatibility.
			// For now, we'll use a simple tone generation
			this.playSimpleTone();
			
		} catch (error) {
			console.warn('🔊 [AUDIO] Fallback ringing failed:', error);
		}
	}

	/**
	 * Play a simple tone using oscillator (most compatible)
	 */
	playSimpleTone() {
		if (!this.audioContext) return;

		const playTone = () => {
			if (!this.isRinging) return;

			try {
				const oscillator = this.audioContext.createOscillator();
				const gainNode = this.audioContext.createGain();
				
				oscillator.connect(gainNode);
				gainNode.connect(this.audioContext.destination);
				
				oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
				oscillator.type = 'sine';
				
				gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
				gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.1);
				gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.4);
				
				oscillator.start(this.audioContext.currentTime);
				oscillator.stop(this.audioContext.currentTime + 0.4);
				
				// Schedule next beep
				setTimeout(playTone, 1000);
			} catch (error) {
				console.warn('🔊 [AUDIO] Error playing tone:', error);
			}
		};

		playTone();
	}

	/**
	 * Stop ringing sound
	 */
	stopRinging() {
		if (!this.isRinging) return;

		try {
			console.log('🔊 [AUDIO] Stopping ringing sound');
			this.isRinging = false;

			// Stop Web Audio API source
			if (this.currentSource) {
				this.currentSource.stop();
				this.currentSource = null;
			}

			// Stop HTML5 audio
			if (this.ringingAudio) {
				this.ringingAudio.pause();
				this.ringingAudio.currentTime = 0;
				this.ringingAudio = null;
			}
		} catch (error) {
			console.warn('🔊 [AUDIO] Error stopping ringing:', error);
		}
	}

	/**
	 * Play a short notification sound
	 */
	playNotification() {
		if (!this.audioContext) return;

		try {
			const oscillator = this.audioContext.createOscillator();
			const gainNode = this.audioContext.createGain();
			
			oscillator.connect(gainNode);
			gainNode.connect(this.audioContext.destination);
			
			oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
			oscillator.type = 'sine';
			
			gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
			gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.05);
			gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);
			
			oscillator.start(this.audioContext.currentTime);
			oscillator.stop(this.audioContext.currentTime + 0.2);
		} catch (error) {
			console.warn('🔊 [AUDIO] Error playing notification:', error);
		}
	}

	/**
	 * Cleanup audio resources
	 */
	cleanup() {
		this.stopRinging();
		
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
	}
}

// Export singleton instance
export const callAudioManager = new CallAudioManager();