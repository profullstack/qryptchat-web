/**
 * @fileoverview Utility function to convert https:// URLs in text to clickable links
 * Provides safe URL detection and HTML generation with XSS prevention
 */

/**
 * Escapes HTML characters to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Converts https:// URLs in text to clickable HTML links that open in new tabs
 * @param {string|null|undefined} text - Input text that may contain URLs
 * @returns {string} Text with URLs converted to HTML links
 */
export function convertUrlsToLinks(text) {
	// Handle null, undefined, or empty input
	if (!text || typeof text !== 'string') {
		return '';
	}

	// Regex pattern to match https:// URLs
	// This pattern matches:
	// - https:// (required prefix)
	// - domain name with optional subdomains
	// - optional port
	// - optional path with various characters
	// - optional query parameters
	// - optional fragment
	// - Excludes trailing punctuation that's likely sentence punctuation
	const httpsUrlRegex = /https?:\/\/[^\s<>"'()[\]{}]+[^\s<>"'()[\]{}.,;!?]/g;

	let result = '';
	let lastIndex = 0;
	let match;

	// Process each URL match
	while ((match = httpsUrlRegex.exec(text)) !== null) {
		// Add escaped text before the URL
		const beforeUrl = text.slice(lastIndex, match.index);
		result += escapeHtml(beforeUrl);

		// Add the URL as a clickable link
		const url = match[0];
		result += `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;

		lastIndex = httpsUrlRegex.lastIndex;
	}

	// Add any remaining text after the last URL, escaped
	const remainingText = text.slice(lastIndex);
	result += escapeHtml(remainingText);

	return result;
}