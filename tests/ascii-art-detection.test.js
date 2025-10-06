import { describe, it, expect } from 'vitest';
import { detectAsciiArt } from '../src/lib/utils/ascii-art-detection.js';

describe('ASCII Art Detection', () => {
	describe('detectAsciiArt', () => {
		it('should detect simple ASCII art with box drawing characters', () => {
			const text = `
┌─────────┐
│  Hello  │
└─────────┘
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should detect ASCII art with multiple lines of special characters', () => {
			const text = `
  /\\_/\\  
 ( o.o ) 
  > ^ <
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should detect ASCII art with repeating patterns', () => {
			const text = `
*****
*   *
*   *
*****
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should not detect regular text as ASCII art', () => {
			const text = 'This is just a normal message with some text.';
			expect(detectAsciiArt(text)).to.be.false;
		});

		it('should not detect text with occasional special characters', () => {
			const text = 'Hey! How are you? :) Let\'s meet @ 5pm.';
			expect(detectAsciiArt(text)).to.be.false;
		});

		it('should detect ASCII art with high density of special characters', () => {
			const text = `
    ___
   /   \\
  |  o  |
   \\___/
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should handle empty strings', () => {
			expect(detectAsciiArt('')).to.be.false;
		});

		it('should handle single line with special characters', () => {
			const text = '═══════════════';
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should not detect code snippets as ASCII art', () => {
			const text = 'const x = 10;\nif (x > 5) {\n  console.log("hi");\n}';
			expect(detectAsciiArt(text)).to.be.false;
		});

		it('should detect banner-style ASCII art', () => {
			const text = `
╔═══════════════╗
║   WELCOME!    ║
╚═══════════════╝
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should detect ASCII art with mixed characters', () => {
			const text = `
  _____
 /     \\
|  ^_^  |
 \\_____/
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});

		it('should not detect URLs as ASCII art', () => {
			const text = 'Check out https://example.com/path?query=value';
			expect(detectAsciiArt(text)).to.be.false;
		});

		it('should detect table-like ASCII structures', () => {
			const text = `
+-------+-------+
| Col 1 | Col 2 |
+-------+-------+
| A     | B     |
+-------+-------+
			`.trim();
			expect(detectAsciiArt(text)).to.be.true;
		});
	});
});