import { describe, expect, it } from 'vitest';
import { getClientIp, readTrustedProxyCount } from '../src/middleware.js';

function requestWithHeaders(headers) {
  return {
    headers: {
      get(name) {
        return headers[name.toLowerCase()] ?? null;
      }
    }
  };
}

describe('middleware trusted proxy count', () => {
  it('ignores malformed TRUSTED_PROXY_COUNT values', () => {
    expect(readTrustedProxyCount('2abc')).toBe(0);
    expect(readTrustedProxyCount('1.5')).toBe(0);
    expect(readTrustedProxyCount('-1')).toBe(0);
    expect(readTrustedProxyCount('2')).toBe(2);
  });

  it('falls back to x-real-ip when TRUSTED_PROXY_COUNT is malformed', () => {
    const previous = process.env.TRUSTED_PROXY_COUNT;
    process.env.TRUSTED_PROXY_COUNT = '1abc';

    expect(
      getClientIp(
        requestWithHeaders({
          'x-forwarded-for': '203.0.113.10, 198.51.100.20',
          'x-real-ip': '198.51.100.99'
        })
      )
    ).toBe('198.51.100.99');

    process.env.TRUSTED_PROXY_COUNT = previous;
  });
});
