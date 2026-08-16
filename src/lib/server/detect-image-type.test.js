import { describe, expect, it } from 'vitest';
import { detectImageType } from './detect-image-type.js';

/** Build a 16-byte buffer starting with `head`, so length checks always pass. */
function bytes(head) {
	const out = new Uint8Array(16);
	head.forEach((b, i) => (out[i] = b));
	return out;
}

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

describe('detectImageType', () => {
	it('identifies the four allowed formats by magic bytes', () => {
		expect(detectImageType(bytes([0xff, 0xd8, 0xff]))).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
		expect(detectImageType(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
			.toEqual({ mime: 'image/png', ext: 'png' });
		expect(detectImageType(bytes(ascii('GIF89a')))).toEqual({ mime: 'image/gif', ext: 'gif' });

		const webp = new Uint8Array(16);
		ascii('RIFF').forEach((b, i) => (webp[i] = b));
		ascii('WEBP').forEach((b, i) => (webp[8 + i] = b));
		expect(detectImageType(webp)).toEqual({ mime: 'image/webp', ext: 'webp' });
	});

	// The point of the change: a caller claiming image/png proves nothing.
	it('rejects non-image content regardless of what the caller claims', () => {
		expect(detectImageType(bytes(ascii('<?php system($_GET[0]);')))).toBeNull();
		expect(detectImageType(bytes(ascii('<svg onload=alert(1)>')))).toBeNull();
		expect(detectImageType(bytes([0x4d, 0x5a]))).toBeNull(); // PE executable
	});

	it('rejects input too short to carry a signature', () => {
		expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
		expect(detectImageType(new Uint8Array())).toBeNull();
		expect(detectImageType(null)).toBeNull();
	});
});
