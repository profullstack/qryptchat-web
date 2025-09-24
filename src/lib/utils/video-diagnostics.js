/**
 * @fileoverview Video codec detection and PWA compatibility utilities
 * Helps diagnose and resolve video playback issues in PWA environments
 */

/**
 * Detect supported video codecs and formats
 * @returns {Promise<Object>} Object containing codec support information
 */
export async function detectVideoCodecSupport() {
	const video = document.createElement('video');
	const codecs = {
		// Common video formats
		mp4_h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
		mp4_h265: video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"'),
		webm_vp8: video.canPlayType('video/webm; codecs="vp8"'),
		webm_vp9: video.canPlayType('video/webm; codecs="vp9"'),
		webm_av1: video.canPlayType('video/webm; codecs="av01.0.05M.08"'),
		ogg_theora: video.canPlayType('video/ogg; codecs="theora"'),
		
		// Audio codecs (for reference)
		mp4_aac: video.canPlayType('video/mp4; codecs="mp4a.40.2"'),
		webm_vorbis: video.canPlayType('video/webm; codecs="vorbis"'),
		webm_opus: video.canPlayType('video/webm; codecs="opus"')
	};

	// Convert support levels to boolean
	const support = {};
	for (const [codec, level] of Object.entries(codecs)) {
		support[codec] = level === 'probably' || level === 'maybe';
	}

	return {
		raw: codecs,
		supported: support,
		isPWA: window.matchMedia('(display-mode: standalone)').matches,
		userAgent: navigator.userAgent,
		platform: navigator.platform
	};
}

/**
 * Check if hardware acceleration is available
 * @returns {Promise<Object>} Hardware acceleration info
 */
export async function checkHardwareAcceleration() {
	const canvas = document.createElement('canvas');
	const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	
	if (!gl) {
		return { available: false, reason: 'WebGL not supported' };
	}

	try {
		const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
		const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
		const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';

		return {
			available: true,
			renderer,
			vendor,
			webglVersion: gl.getParameter(gl.VERSION)
		};
	} catch (error) {
		return {
			available: false,
			reason: 'WebGL context error: ' + error.message
		};
	}
}

/**
 * Enhanced video element creation with PWA-specific optimizations
 * @param {string} src - Video source URL
 * @param {Object} options - Video options
 * @returns {HTMLVideoElement} Optimized video element
 */
export function createOptimizedVideoElement(src, options = {}) {
	const video = document.createElement('video');
	
	// Basic attributes
	video.src = src;
	video.controls = options.controls !== false;
	video.preload = options.preload || 'metadata';
	
	// PWA-specific optimizations
	video.setAttribute('playsinline', 'true'); // Prevent fullscreen on mobile
	video.setAttribute('webkit-playsinline', 'true'); // iOS Safari
	
	// Disable picture-in-picture if not needed
	if (options.disablePiP !== false) {
		video.disablePictureInPicture = true;
	}
	
	// Add error handling
	video.addEventListener('error', (e) => {
		const target = e.target;
		if (target && target.error) {
			console.error('Video playback error:', {
				error: target.error,
				code: target.error.code,
				message: target.error.message,
				src: target.src
			});
		}
	});

	// Add loading state tracking
	video.addEventListener('loadstart', () => {
		console.log('Video loading started:', src);
	});

	video.addEventListener('canplay', () => {
		console.log('Video can start playing:', src);
	});

	video.addEventListener('canplaythrough', () => {
		console.log('Video can play through:', src);
	});

	return video;
}

/**
 * Attempt to fix common video playback issues
 * @param {HTMLVideoElement} videoElement - Video element to fix
 * @returns {Promise<boolean>} Whether fixes were applied successfully
 */
export async function attemptVideoPlaybackFix(videoElement) {
	const fixes = [];

	try {
		// Fix 1: Force reload with different preload strategy
		if (videoElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
			videoElement.preload = 'auto';
			videoElement.load();
			fixes.push('preload-auto');
		}

		// Fix 2: Try to enable hardware acceleration
		if (videoElement.style.transform === '') {
			videoElement.style.transform = 'translateZ(0)';
			fixes.push('hardware-acceleration');
		}

		// Fix 3: Set explicit dimensions to help with rendering
		if (!videoElement.width && !videoElement.height) {
			videoElement.style.width = '100%';
			videoElement.style.height = 'auto';
			fixes.push('explicit-dimensions');
		}

		// Fix 4: Add crossorigin attribute for blob URLs
		if (videoElement.src.startsWith('blob:')) {
			videoElement.crossOrigin = 'anonymous';
			fixes.push('crossorigin-anonymous');
		}

		console.log('Applied video fixes:', fixes);
		return fixes.length > 0;

	} catch (error) {
		console.error('Error applying video fixes:', error);
		return false;
	}
}

/**
 * Generate comprehensive video diagnostic report
 * @returns {Promise<Object>} Diagnostic report
 */
export async function generateVideoDiagnosticReport() {
	const codecSupport = await detectVideoCodecSupport();
	const hardwareAccel = await checkHardwareAcceleration();
	
	const report = {
		timestamp: new Date().toISOString(),
		environment: {
			isPWA: codecSupport.isPWA,
			userAgent: codecSupport.userAgent,
			platform: codecSupport.platform,
			displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser'
		},
		codecSupport: codecSupport.supported,
		hardwareAcceleration: hardwareAccel,
		recommendations: []
	};

	// Generate recommendations
	if (!codecSupport.supported.mp4_h264 && !codecSupport.supported.webm_vp8) {
		report.recommendations.push('Install additional video codecs on your system');
	}

	if (!hardwareAccel.available) {
		report.recommendations.push('Enable hardware acceleration in browser settings');
	}

	if (codecSupport.isPWA && !codecSupport.supported.webm_vp9) {
		report.recommendations.push('Consider converting videos to WebM VP8 format for better PWA compatibility');
	}

	if (codecSupport.platform.includes('Linux')) {
		report.recommendations.push('Install ffmpeg and gstreamer plugins: sudo apt install ubuntu-restricted-extras');
	}

	return report;
}

/**
 * Test video playback with a sample video
 * @param {string} testVideoUrl - URL of test video
 * @returns {Promise<Object>} Test results
 */
export async function testVideoPlayback(testVideoUrl) {
	return new Promise((resolve) => {
		const video = createOptimizedVideoElement(testVideoUrl, { controls: false });
		const results = {
			canLoad: false,
			canPlay: false,
			hasVideo: false,
			hasAudio: false,
			error: null,
			duration: 0
		};

		const timeout = setTimeout(() => {
			video.remove();
			resolve({ ...results, error: 'Timeout' });
		}, 10000);

		video.addEventListener('loadedmetadata', () => {
			results.canLoad = true;
			results.duration = video.duration;
			results.hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
			
			// Check for audio tracks (cross-browser compatible)
			try {
				results.hasAudio = video.mozHasAudio || 
					Boolean(video.webkitAudioDecodedByteCount) || 
					(video.audioTracks && video.audioTracks.length > 0) ||
					false;
			} catch (e) {
				results.hasAudio = false;
			}
		});

		video.addEventListener('canplay', () => {
			results.canPlay = true;
		});

		video.addEventListener('error', (e) => {
			const target = e.target;
			if (target && target.error) {
				results.error = {
					code: target.error.code,
					message: target.error.message
				};
			}
			clearTimeout(timeout);
			video.remove();
			resolve(results);
		});

		video.addEventListener('canplaythrough', () => {
			clearTimeout(timeout);
			video.remove();
			resolve(results);
		});

		// Hide the test video
		video.style.position = 'absolute';
		video.style.left = '-9999px';
		video.style.width = '1px';
		video.style.height = '1px';
		
		document.body.appendChild(video);
	});
}