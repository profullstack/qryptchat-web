// Test suite for URL link converter newline handling
// Using Vitest test framework

import { expect } from 'chai';
import { convertUrlsToLinks } from '../src/lib/utils/url-link-converter.js';

describe('URL Link Converter - Newline Handling', () => {
    describe('Newline conversion', () => {
        it('should convert single newlines to <br> tags', () => {
            const input = 'First line\nSecond line';
            const expected = 'First line<br>Second line';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should convert multiple newlines to multiple <br> tags', () => {
            const input = 'First paragraph\n\nSecond paragraph\nThird line';
            const expected = 'First paragraph<br><br>Second paragraph<br>Third line';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle text with both URLs and newlines', () => {
            const input = 'Check this out:\nhttps://example.com\nPretty cool, right?';
            const expected = 'Check this out:<br><a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a><br>Pretty cool, right?';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should preserve paragraph structure', () => {
            const input = 'Paragraph 1\n\nParagraph 2\n\nParagraph 3';
            const expected = 'Paragraph 1<br><br>Paragraph 2<br><br>Paragraph 3';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle empty lines correctly', () => {
            const input = 'Line 1\n\n\nLine 4';
            const expected = 'Line 1<br><br><br>Line 4';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle text starting or ending with newlines', () => {
            const input = '\nStarting with newline\nEnding with newline\n';
            const expected = '<br>Starting with newline<br>Ending with newline<br>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should escape HTML in text while preserving newlines', () => {
            const input = 'Some <script>alert("xss")</script>\nSecond line';
            const expected = 'Some &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;<br>Second line';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle complex mixed content', () => {
            const input = 'First paragraph with https://example.com\n\nSecond paragraph\nWith multiple lines\n\nAnd another URL: https://test.com';
            const expected = 'First paragraph with <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a><br><br>Second paragraph<br>With multiple lines<br><br>And another URL: <a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });
    });

    describe('Code block handling', () => {
        it('should convert triple backticks to code blocks', () => {
            const input = 'Here is some code:\n```\nfunction hello() {\n  console.log("Hello!");\n}\n```\nThat was the code.';
            const expected = 'Here is some code:<br><pre><code>\nfunction hello() {\n  console.log(&quot;Hello!&quot;);\n}\n</code></pre><br>That was the code.';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle inline code blocks', () => {
            const input = 'Use ```console.log("test")``` to debug.';
            const expected = 'Use <pre><code>console.log(&quot;test&quot;)</code></pre> to debug.';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle multiple code blocks', () => {
            const input = 'First: ```code1``` and second: ```code2```';
            const expected = 'First: <pre><code>code1</code></pre> and second: <pre><code>code2</code></pre>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should escape HTML in code blocks', () => {
            const input = 'Code: ```<script>alert("xss")</script>```';
            const expected = 'Code: <pre><code>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</code></pre>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should not process URLs inside code blocks', () => {
            const input = 'Code: ```fetch("https://api.example.com")```';
            const expected = 'Code: <pre><code>fetch(&quot;https://api.example.com&quot;)</code></pre>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle code blocks with newlines and URLs outside', () => {
            const input = 'Check this:\n```\nconst url = "https://example.com";\nconsole.log(url);\n```\nVisit: https://test.com';
            const expected = 'Check this:<br><pre><code>\nconst url = &quot;https://example.com&quot;;\nconsole.log(url);\n</code></pre><br>Visit: <a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });
    });

    describe('Tab and spacing handling', () => {
        it('should convert tabs to 4 non-breaking spaces', () => {
            const input = 'Line 1\tTabbed content\tMore tabs';
            const expected = 'Line 1&nbsp;&nbsp;&nbsp;&nbsp;Tabbed content&nbsp;&nbsp;&nbsp;&nbsp;More tabs';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should convert multiple spaces to non-breaking spaces', () => {
            const input = 'Word1    Word2      Word3';
            const expected = 'Word1&nbsp;&nbsp;&nbsp;&nbsp;Word2&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Word3';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should preserve single spaces normally', () => {
            const input = 'Word1 Word2 Word3';
            const expected = 'Word1 Word2 Word3';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle mixed tabs, spaces, and newlines', () => {
            const input = 'Line 1\n\tIndented line\n    Four spaces\n        Eight spaces';
            const expected = 'Line 1<br>&nbsp;&nbsp;&nbsp;&nbsp;Indented line<br>&nbsp;&nbsp;&nbsp;&nbsp;Four spaces<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Eight spaces';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle code blocks with preserved spacing', () => {
            const input = 'Code example:\n```\nfunction test() {\n\treturn "hello";\n}\n```';
            const expected = 'Code example:<br><pre><code>\nfunction test() {\n\treturn &quot;hello&quot;;\n}\n</code></pre>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle formatted text with indentation', () => {
            const input = 'List:\n  - Item 1\n  - Item 2\n    - Nested item\n      - Double nested';
            const expected = 'List:<br>&nbsp;&nbsp;- Item 1<br>&nbsp;&nbsp;- Item 2<br>&nbsp;&nbsp;&nbsp;&nbsp;- Nested item<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;- Double nested';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });
    });

    describe('Edge cases', () => {
        it('should handle only newlines', () => {
            const input = '\n\n\n';
            const expected = '<br><br><br>';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle empty string', () => {
            const input = '';
            const expected = '';
            const result = convertUrlsToLinks(input);
            
            expect(result).to.equal(expected);
        });

        it('should handle null and undefined', () => {
            expect(convertUrlsToLinks(null)).to.equal('');
            expect(convertUrlsToLinks(undefined)).to.equal('');
        });
    });
});