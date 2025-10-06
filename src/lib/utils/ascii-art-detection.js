/**
 * @fileoverview ASCII Art Detection Utility
 * Detects if text content is likely ASCII art based on character patterns and density
 */

/**
 * Common ASCII art characters (box drawing, symbols, etc.)
 */
const ASCII_ART_CHARS = new Set([
	// Box drawing characters
	'─', '━', '│', '┃', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼',
	'═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
	'╭', '╮', '╯', '╰', '╱', '╲', '╳',
	// Common ASCII art symbols
	'▀', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▉', '▊', '▋', '▌', '▍', '▎', '▏',
	'▐', '░', '▒', '▓', '▔', '▕', '▖', '▗', '▘', '▙', '▚', '▛', '▜', '▝', '▞', '▟',
	// Geometric shapes
	'■', '□', '▢', '▣', '▤', '▥', '▦', '▧', '▨', '▩', '▪', '▫', '▬', '▭', '▮', '▯',
	'●', '○', '◌', '◍', '◎', '◐', '◑', '◒', '◓', '◔', '◕', '◖', '◗',
	'★', '☆', '✓', '✗', '✦', '✧',
	// Arrows and pointers
	'←', '↑', '→', '↓', '↔', '↕', '⇐', '⇑', '⇒', '⇓', '⇔', '⇕',
	'◄', '►', '▲', '▼', '◀', '▶',
	// Common patterns
	'+', '-', '|', '/', '\\', '*', '#', '=', '_', '^', '~', '<', '>'
]);

/**
 * Detects if the given text is likely ASCII art
 * @param {string} text - The text to analyze
 * @returns {boolean} True if text appears to be ASCII art
 */
export function detectAsciiArt(text) {
	if (!text || typeof text !== 'string') {
		return false;
	}

	const trimmedText = text.trim();
	
	// Empty or very short text is not ASCII art
	if (trimmedText.length < 5) {
		return false;
	}

	const lines = trimmedText.split('\n');
	
	// Single line text needs higher threshold
	if (lines.length === 1) {
		return analyzeSingleLine(trimmedText);
	}

	// Multi-line analysis
	return analyzeMultiLine(lines);
}

/**
 * Analyzes a single line of text for ASCII art patterns
 * @param {string} line - The line to analyze
 * @returns {boolean} True if line appears to be ASCII art
 */
function analyzeSingleLine(line) {
	const specialCharCount = countSpecialChars(line);
	const totalChars = line.length;
	
	// For single lines, require at least 60% special characters
	const ratio = specialCharCount / totalChars;
	
	// Also check for repeating patterns (common in ASCII art borders)
	const hasRepeatingPattern = /(.)\1{4,}/.test(line);
	
	return ratio >= 0.6 || (ratio >= 0.4 && hasRepeatingPattern);
}

/**
 * Analyzes multiple lines of text for ASCII art patterns
 * @param {string[]} lines - The lines to analyze
 * @returns {boolean} True if lines appear to be ASCII art
 */
function analyzeMultiLine(lines) {
	// Filter out empty lines for analysis
	const nonEmptyLines = lines.filter(line => line.trim().length > 0);
	
	if (nonEmptyLines.length < 2) {
		return false;
	}

	let totalChars = 0;
	let totalSpecialChars = 0;
	let linesWithHighDensity = 0;

	for (const line of nonEmptyLines) {
		const lineLength = line.length;
		const specialCount = countSpecialChars(line);
		
		totalChars += lineLength;
		totalSpecialChars += specialCount;
		
		// Count lines with high density of special characters
		if (lineLength > 0 && (specialCount / lineLength) >= 0.3) {
			linesWithHighDensity++;
		}
	}

	// Calculate overall ratio
	const overallRatio = totalChars > 0 ? totalSpecialChars / totalChars : 0;
	
	// Check if most lines have high density
	const highDensityRatio = linesWithHighDensity / nonEmptyLines.length;
	
	// Detect structural patterns (common in ASCII art)
	const hasStructuralPattern = detectStructuralPatterns(nonEmptyLines);
	
	// ASCII art typically has:
	// 1. Overall special char ratio > 30%, OR
	// 2. Most lines (>60%) have high density of special chars, OR
	// 3. Clear structural patterns
	return overallRatio >= 0.3 || highDensityRatio >= 0.6 || hasStructuralPattern;
}

/**
 * Counts special characters commonly used in ASCII art
 * @param {string} text - The text to analyze
 * @returns {number} Count of special characters
 */
function countSpecialChars(text) {
	let count = 0;
	
	for (const char of text) {
		if (ASCII_ART_CHARS.has(char)) {
			count++;
		}
	}
	
	return count;
}

/**
 * Detects structural patterns common in ASCII art
 * @param {string[]} lines - The lines to analyze
 * @returns {boolean} True if structural patterns are detected
 */
function detectStructuralPatterns(lines) {
	if (lines.length < 2) {
		return false;
	}

	// Check for box-like structures (similar start/end characters across lines)
	const firstChars = lines.map(line => line.trim()[0]).filter(Boolean);
	const lastChars = lines.map(line => {
		const trimmed = line.trim();
		return trimmed[trimmed.length - 1];
	}).filter(Boolean);
	
	// Check if first/last characters are consistent (common in boxes)
	const firstCharSet = new Set(firstChars);
	const lastCharSet = new Set(lastChars);
	
	// If most lines start/end with the same special character, likely ASCII art
	if (firstCharSet.size <= 2 && lastCharSet.size <= 2) {
		const firstChar = firstChars[0];
		const lastChar = lastChars[0];
		
		if (ASCII_ART_CHARS.has(firstChar) || ASCII_ART_CHARS.has(lastChar)) {
			return true;
		}
	}
	
	// Check for symmetric patterns (common in ASCII art)
	const hasSymmetry = lines.some(line => {
		const trimmed = line.trim();
		if (trimmed.length < 3) return false;
		
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		
		return first === last && ASCII_ART_CHARS.has(first);
	});
	
	return hasSymmetry;
}