/**
 * @fileoverview Identify an image by its magic bytes.
 *
 * An uploader controls both the filename and the Content-Type header, so neither can be
 * allowed to decide what gets written into a public bucket and served back with an image
 * content-type. Only the bytes decide.
 */

/**
 * @param {Uint8Array} bytes
 * @returns {{mime: string, ext: string} | null} null when it is not an allowed image
 */
export function detectImageType(bytes) {
	if (!bytes || bytes.length < 12) return null;

	const startsWith = (...sig) => sig.every((b, i) => bytes[i] === b);
	const ascii = (offset, text) =>
		[...text].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0));

	// JPEG: FF D8 FF
	if (startsWith(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg' };

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
		return { mime: 'image/png', ext: 'png' };
	}

	// GIF: "GIF87a" or "GIF89a"
	if (ascii(0, 'GIF8')) return { mime: 'image/gif', ext: 'gif' };

	// WebP: "RIFF" .... "WEBP"
	if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { mime: 'image/webp', ext: 'webp' };

	return null;
}
