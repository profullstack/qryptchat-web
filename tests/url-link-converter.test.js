import { expect } from 'chai';
import { convertUrlsToLinks } from '../src/lib/utils/url-link-converter.js';

describe('URL Link Converter', () => {
  describe('convertUrlsToLinks', () => {
    it('should convert https:// URLs to clickable links', () => {
      const input = 'Check out https://example.com for more info';
      const expected = 'Check out <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> for more info';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should convert multiple https:// URLs in the same message', () => {
      const input = 'Visit https://example.com and https://test.com';
      const expected = 'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> and <a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs at the beginning of text', () => {
      const input = 'https://example.com is a great site';
      const expected = '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> is a great site';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs at the end of text', () => {
      const input = 'Check this out: https://example.com';
      const expected = 'Check this out: <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs with paths and query parameters', () => {
      const input = 'Visit https://example.com/path?param=value&other=123';
      const expected = 'Visit <a href="https://example.com/path?param=value&other=123" target="_blank" rel="noopener noreferrer">https://example.com/path?param=value&other=123</a>';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs with fragments', () => {
      const input = 'See https://example.com/page#section for details';
      const expected = 'See <a href="https://example.com/page#section" target="_blank" rel="noopener noreferrer">https://example.com/page#section</a> for details';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs surrounded by punctuation', () => {
      const input = '(https://example.com) and "https://test.com"';
      const expected = '(<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>) and &quot;<a href="https://test.com" target="_blank" rel="noopener noreferrer">https://test.com</a>&quot;';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should not convert http:// URLs (only https://)', () => {
      const input = 'Visit http://example.com and https://secure.com';
      const expected = 'Visit http://example.com and <a href="https://secure.com" target="_blank" rel="noopener noreferrer">https://secure.com</a>';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should return original text if no https:// URLs found', () => {
      const input = 'This is just plain text with no URLs';
      expect(convertUrlsToLinks(input)).to.equal(input);
    });

    it('should handle empty string', () => {
      expect(convertUrlsToLinks('')).to.equal('');
    });

    it('should handle null or undefined input gracefully', () => {
      expect(convertUrlsToLinks(null)).to.equal('');
      expect(convertUrlsToLinks(undefined)).to.equal('');
    });

    it('should handle URLs with special characters', () => {
      const input = 'Check https://example.com/path-with_underscore.html?q=test+query';
      const expected = 'Check <a href="https://example.com/path-with_underscore.html?q=test+query" target="_blank" rel="noopener noreferrer">https://example.com/path-with_underscore.html?q=test+query</a>';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should handle URLs ending with periods (common in sentences)', () => {
      const input = 'Visit https://example.com. It\'s great!';
      const expected = 'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a>. It&#39;s great!';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });

    it('should escape HTML in non-URL text to prevent XSS', () => {
      const input = 'Visit https://example.com and <script>alert("xss")</script>';
      const expected = 'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> and &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;';
      expect(convertUrlsToLinks(input)).to.equal(expected);
    });
  });
});