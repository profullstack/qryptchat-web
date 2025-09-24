/**
 * @fileoverview Tests for video diagnostics utility
 * Tests codec detection, hardware acceleration checks, and PWA compatibility
 */

import { expect } from 'chai';
import { JSDOM } from 'jsdom';

// Mock DOM environment for testing
const dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
	url: 'https://localhost:3000',
	pretendToBeVisual: true,
	resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLVideoElement = dom.window.HTMLVideoElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.URL = dom.window.URL;

// Mock video element with codec support
class MockVideoElement {
	constructor() {
		this.canPlayType = this.canPlayType.bind(this);
	}

	canPlayType(type) {
		// Simulate common codec support patterns
		const codecSupport = {
			'video/mp4; codecs="avc1.42E01E"': 'probably', // H.264
			'video/webm; codecs="vp8"': 'probably', // VP8
			'video/webm; codecs="vp9"': 'maybe', // VP9
			'video/webm; codecs="av01.0.05M.08"': '', // AV1 - not supported
			'video/ogg; codecs="theora"': '', // Theora - not supported
			'video/mp4; codecs="mp4a.40.2"': 'probably', // AAC
			'video/webm; codecs="vorbis"': 'probably', // Vorbis
			'video/webm; codecs="opus"': 'probably' // Opus
		};
		
		return codecSupport[type] || '';
	}
}

// Mock canvas and WebGL context
class MockWebGLRenderingContext {
	constructor() {
		this.VERSION = 0x1F02;
	}

	getExtension(name) {
		if (name === 'WEBGL_debug_renderer_info') {
			return {
				UNMASKED_RENDERER_WEBGL: 0x9246,
				UNMASKED_VENDOR_WEBGL: 0x9245
			};
		}
		return null;
	}

	getParameter(param) {
		if (param === 0x9246) return 'Mock GPU Renderer';
		if (param === 0x9245) return 'Mock GPU Vendor';
		if (param === this.VERSION) return 'WebGL 1.0 Mock';
		return null;
	}
}

// Override createElement to return our mocks
const originalCreateElement = document.createElement;
document.createElement = function(tagName) {
	if (tagName === 'video') {
		return new MockVideoElement();
	}
	if (tagName === 'canvas') {
		const canvas = originalCreateElement.call(this, tagName);
		canvas.getContext = function(type) {
			if (type === 'webgl' || type === 'experimental-webgl') {
				return new MockWebGLRenderingContext();
			}
			return originalCreateElement.call(document, 'canvas').getContext(type);
		};
		return canvas;
	}
	return originalCreateElement.call(this, tagName);
};

// Mock matchMedia for PWA detection
window.matchMedia = function(query) {
	return {
		matches: query.includes('standalone'),
		media: query,
		onchange: null,
		addListener: function() {},
		removeListener: function() {},
		addEventListener: function() {},
		removeEventListener: function() {},
		dispatchEvent: function() {}
	};
};

// Now import the module to test
const { 
	detectVideoCodecSupport, 
	checkHardwareAcceleration,
	generateVideoDiagnosticReport,
	createOptimizedVideoElement,
	attemptVideoPlaybackFix
} = await import('../src/lib/utils/video-diagnostics.js');

describe('Video Diagnostics Utility', () => {
	describe('detectVideoCodecSupport', () => {
		it('should detect supported video codecs', async () => {
			const support = await detectVideoCodecSupport();
			
			expect(support).to.have.property('raw');
			expect(support).to.have.property('supported');
			expect(support).to.have.property('isPWA');
			expect(support).to.have.property('userAgent');
			expect(support).to.have.property('platform');
			
			// Check that our mock codecs are detected
			expect(support.supported.mp4_h264).to.be.true;
			expect(support.supported.webm_vp8).to.be.true;
			expect(support.supported.webm_vp9).to.be.true;
			expect(support.supported.webm_av1).to.be.false;
		});

		it('should detect PWA context correctly', async () => {
			const support = await detectVideoCodecSupport();
			expect(support.isPWA).to.be.true; // Our mock returns true for standalone
		});
	});

	describe('checkHardwareAcceleration', () => {
		it('should check hardware acceleration availability', async () => {
			const hwAccel = await checkHardwareAcceleration();
			
			expect(hwAccel).to.have.property('available');
			expect(hwAccel.available).to.be.true;
			expect(hwAccel).to.have.property('renderer');
			expect(hwAccel).to.have.property('vendor');
			expect(hwAccel).to.have.property('webglVersion');
			
			expect(hwAccel.renderer).to.equal('Mock GPU Renderer');
			expect(hwAccel.vendor).to.equal('Mock GPU Vendor');
		});
	});

	describe('generateVideoDiagnosticReport', () => {
		it('should generate comprehensive diagnostic report', async () => {
			const report = await generateVideoDiagnosticReport();
			
			expect(report).to.have.property('timestamp');
			expect(report).to.have.property('environment');
			expect(report).to.have.property('codecSupport');
			expect(report).to.have.property('hardwareAcceleration');
			expect(report).to.have.property('recommendations');
			
			// Check environment details
			expect(report.environment.isPWA).to.be.true;
			expect(report.environment.displayMode).to.equal('standalone');
			
			// Check codec support
			expect(report.codecSupport.mp4_h264).to.be.true;
			expect(report.codecSupport.webm_vp8).to.be.true;
			
			// Check hardware acceleration
			expect(report.hardwareAcceleration.available).to.be.true;
			
			// Recommendations should be an array
			expect(report.recommendations).to.be.an('array');
		});

		it('should provide relevant recommendations', async () => {
			const report = await generateVideoDiagnosticReport();
			
			// Since our mock has good codec support and hardware acceleration,
			// there should be minimal recommendations
			expect(report.recommendations.length).to.be.lessThan(3);
		});
	});

	describe('createOptimizedVideoElement', () => {
		it('should create video element with PWA optimizations', () => {
			const testUrl = 'blob:https://example.com/test-video';
			const video = createOptimizedVideoElement(testUrl, {
				controls: true,
				preload: 'auto'
			});
			
			expect(video).to.be.instanceOf(MockVideoElement);
			expect(video.src).to.equal(testUrl);
			expect(video.controls).to.be.true;
			expect(video.preload).to.equal('auto');
		});

		it('should set PWA-specific attributes', () => {
			const video = createOptimizedVideoElement('test.mp4');
			
			expect(video.getAttribute('playsinline')).to.equal('true');
			expect(video.getAttribute('webkit-playsinline')).to.equal('true');
			expect(video.disablePictureInPicture).to.be.true;
		});
	});

	describe('attemptVideoPlaybackFix', () => {
		it('should apply fixes to video element', async () => {
			const video = createOptimizedVideoElement('test.mp4');
			
			// Mock networkState to trigger preload fix
			video.networkState = 0; // HTMLMediaElement.NETWORK_NO_SOURCE
			video.load = function() { this.networkState = 1; };
			
			const fixesApplied = await attemptVideoPlaybackFix(video);
			
			expect(fixesApplied).to.be.true;
			expect(video.preload).to.equal('auto');
		});

		it('should handle blob URLs correctly', async () => {
			const video = createOptimizedVideoElement('blob:https://example.com/test');
			
			const fixesApplied = await attemptVideoPlaybackFix(video);
			
			expect(fixesApplied).to.be.true;
			expect(video.crossOrigin).to.equal('anonymous');
		});
	});

	describe('Error Handling', () => {
		it('should handle WebGL context creation failure', async () => {
			// Temporarily override getContext to return null
			const originalGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function() { return null; };
			
			const hwAccel = await checkHardwareAcceleration();
			
			expect(hwAccel.available).to.be.false;
			expect(hwAccel.reason).to.equal('WebGL not supported');
			
			// Restore original method
			HTMLCanvasElement.prototype.getContext = originalGetContext;
		});

		it('should handle video element creation errors gracefully', async () => {
			// This test ensures our functions don't throw on edge cases
			const video = createOptimizedVideoElement('');
			expect(video.src).to.equal('');
			
			const fixesApplied = await attemptVideoPlaybackFix(video);
			expect(fixesApplied).to.be.a('boolean');
		});
	});

	describe('Codec Detection Edge Cases', () => {
		it('should handle unknown codec types', async () => {
			const support = await detectVideoCodecSupport();
			
			// All codec support should be boolean values
			Object.values(support.supported).forEach(isSupported => {
				expect(isSupported).to.be.a('boolean');
			});
		});

		it('should provide fallback values for missing properties', async () => {
			const support = await detectVideoCodecSupport();
			
			expect(support.userAgent).to.be.a('string');
			expect(support.platform).to.be.a('string');
			expect(support.isPWA).to.be.a('boolean');
		});
	});
});

describe('Integration Tests', () => {
	it('should work end-to-end for PWA video diagnostics', async () => {
		// Simulate a complete diagnostic workflow
		const codecSupport = await detectVideoCodecSupport();
		const hwAccel = await checkHardwareAcceleration();
		const report = await generateVideoDiagnosticReport();
		
		// Verify the report contains data from both checks
		expect(report.codecSupport).to.deep.equal(codecSupport.supported);
		expect(report.hardwareAcceleration).to.deep.equal(hwAccel);
		
		// Verify recommendations are contextual
		if (!codecSupport.supported.mp4_h264 && !codecSupport.supported.webm_vp8) {
			expect(report.recommendations).to.include.members([
				'Install additional video codecs on your system'
			]);
		}
		
		if (!hwAccel.available) {
			expect(report.recommendations).to.include.members([
				'Enable hardware acceleration in browser settings'
			]);
		}
	});

	it('should create optimized video elements that work with diagnostics', async () => {
		const video = createOptimizedVideoElement('test.mp4');
		const fixesApplied = await attemptVideoPlaybackFix(video);
		
		// Video should have PWA optimizations applied
		expect(video.getAttribute('playsinline')).to.equal('true');
		expect(video.style.transform).to.include('translateZ(0)');
		
		// Fixes should be applicable
		expect(fixesApplied).to.be.a('boolean');
	});
});