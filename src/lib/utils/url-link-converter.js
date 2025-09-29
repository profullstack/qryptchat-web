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
 * Converts text formatting to HTML with support for:
 * - https:// URLs to clickable HTML links
 * - newlines (\n) to <br> tags
 * - code blocks (```...```) to <pre><code> elements
 * - tabs (\t) to 4 non-breaking spaces
 * - multiple spaces to non-breaking spaces for preserved indentation
 * @param {string|null|undefined} text - Input text that may contain URLs, newlines, code blocks, tabs, and spaces
 * @returns {string} Text with all formatting converted to HTML while maintaining XSS protection
 */
export function convertUrlsToLinks(text) {
	// Handle null, undefined, or empty input
	if (!text || typeof text !== 'string') {
		return '';
	}

	// First, handle code blocks (```...```) to protect them from other processing
	const codeBlockRegex = /```([\s\S]*?)```/g;
	const codeBlocks = [];
	let textWithPlaceholders = text;
	let codeMatch;
	let codeIndex = 0;

	// Extract code blocks and replace with placeholders
	while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
		const placeholder = `__CODE_BLOCK_${codeIndex}__`;
		const codeContent = codeMatch[1];
		codeBlocks.push(`<pre><code>${escapeHtml(codeContent)}</code></pre>`);
		textWithPlaceholders = textWithPlaceholders.replace(codeMatch[0], placeholder);
		codeIndex++;
	}

	// Reset regex for URL processing
	const httpsUrlRegex = /https?:\/\/[^\s<>"'()[\]{}]+[^\s<>"'()[\]{}.,;!?]/g;

	let result = '';
	let lastIndex = 0;
	let match;

	// Process each URL match in the text with code block placeholders
	while ((match = httpsUrlRegex.exec(textWithPlaceholders)) !== null) {
		// Add escaped text before the URL
		const beforeUrl = textWithPlaceholders.slice(lastIndex, match.index);
		result += escapeHtml(beforeUrl);

		// Add the URL as a clickable link
		const url = match[0];
		result += `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;

		lastIndex = httpsUrlRegex.lastIndex;
	}

	// Add any remaining text after the last URL, escaped
	const remainingText = textWithPlaceholders.slice(lastIndex);
	result += escapeHtml(remainingText);

	// Convert newlines to <br> tags
	result = result.replace(/\n/g, '<br>');

	// Convert tabs to 4 non-breaking spaces
	result = result.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');

	// Convert multiple consecutive spaces to non-breaking spaces (preserve spacing)
	result = result.replace(/ {2,}/g, (match) => {
		return '&nbsp;'.repeat(match.length);
	});

	// Restore code blocks from placeholders
	codeBlocks.forEach((codeBlock, index) => {
		const placeholder = `__CODE_BLOCK_${index}__`;
		result = result.replace(placeholder, codeBlock);
	});

	return result;
}