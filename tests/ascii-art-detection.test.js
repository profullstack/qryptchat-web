/**
 * Test suite for ASCII art detection in message rendering
 * Tests the isAsciiArt detection logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Detect ASCII art: multiple lines with special characters commonly used in ASCII art
 * @param {string} content - The message content to check
 * @returns {boolean} - True if content appears to be ASCII art
 */
function isAsciiArt(content) {
	const lines = content.split('\n').filter(line => line.trim().length > 0);
	if (lines.length < 3) return false;
	
	// Check if multiple lines contain ASCII art characters
	const asciiArtChars = /[│┤┐└┴┬├─┼╔╗╚╝║═╠╣╩╦╬▀▄█▌▐░▒▓■□▪▫◘◙◚◛◜◝◞◟◠◡◢◣◤◥●◦◯◰◱◲◳◴◵◶◷◸◹◺◻◼◽◾◿]/;
	const commonAsciiChars = /[|\/\\\_\-\+\*\#\@\%\&\$\^\~\`\(\)\[\]\{\}<>]/g;
	
	const linesWithAsciiArt = lines.filter(line => {
		// Check for box drawing or special Unicode characters
		if (asciiArtChars.test(line)) return true;
		
		// Check for common ASCII art patterns (at least 3 special chars in a line)
		const specialCharCount = (line.match(commonAsciiChars) || []).length;
		if (specialCharCount >= 3) return true;
		
		// Check for repeated patterns typical of ASCII art (like "88" or "***")
		// This catches figlet-style ASCII art made from repeated characters
		if (/(.)\1{2,}/.test(line) && line.length > 5) return true;
		
		return false;
	});
	
	return linesWithAsciiArt.length >= 3;
}

describe('ASCII Art Detection', () => {
	it('should detect ASCII art with box drawing characters', () => {
		const asciiArt = `
88                                           88 
88                                           88 
88                                           88 
88,dPPYba,  8b,dPPYba,  ,adPPYba, ,adPPYYba, 88   ,d8 
88P'    "8a 88P'   "Y8 a8P_____88 ""     \`Y8 88 ,a8" 
88       d8 88         8PP""""""" ,adPPPPP88 8888[ 
88b,   ,a8" 88         "8b,   ,aa 88,    ,88 88\`"Yba, 
8Y"Ybbd8"'  88          \`"Ybbd8"' \`"8bbdP"Y8 88   \`Y8a
		`;
		
		assert.strictEqual(isAsciiArt(asciiArt), true, 'Should detect ASCII art with special characters');
	});

	it('should detect ASCII art with box characters', () => {
		const boxArt = `
╔═══════════════╗
║   Hello Box   ║
║   ASCII Art   ║
╚═══════════════╝
		`;
		
		assert.strictEqual(isAsciiArt(boxArt), true, 'Should detect box drawing ASCII art');
	});

	it('should detect ASCII art with common characters', () => {
		const simpleArt = `
  /\\_/\\  
 ( o.o ) 
  > ^ <
 /|   |\\
(_|   |_)
		`;
		
		assert.strictEqual(isAsciiArt(simpleArt), true, 'Should detect simple ASCII art');
	});

	it('should not detect regular text as ASCII art', () => {
		const regularText = 'This is just a regular message with no ASCII art';
		
		assert.strictEqual(isAsciiArt(regularText), false, 'Should not detect regular text as ASCII art');
	});

	it('should not detect short multi-line text as ASCII art', () => {
		const shortText = `
Line 1
Line 2
		`;
		
		assert.strictEqual(isAsciiArt(shortText), false, 'Should not detect short text as ASCII art');
	});

	it('should not detect code snippets as ASCII art', () => {
		const codeSnippet = `
function hello() {
  console.log("Hello");
}
		`;
		
		assert.strictEqual(isAsciiArt(codeSnippet), false, 'Should not detect code as ASCII art');
	});

	it('should detect banner-style ASCII art', () => {
		const banner = `
***********************
*   WELCOME MESSAGE   *
*   ASCII ART DEMO    *
***********************
		`;
		
		assert.strictEqual(isAsciiArt(banner), true, 'Should detect banner-style ASCII art');
	});

	it('should handle empty strings', () => {
		assert.strictEqual(isAsciiArt(''), false, 'Should handle empty strings');
	});

	it('should handle single line strings', () => {
		assert.strictEqual(isAsciiArt('Single line'), false, 'Should handle single line strings');
	});
});