import { describe, expect, it } from 'vitest';
import { normalizeMessagePagination } from './pagination.js';

describe('normalizeMessagePagination', () => {
  it('uses default pagination when query params are missing', () => {
    expect(normalizeMessagePagination(new URLSearchParams())).toEqual({
      limit: 50,
      offset: 0
    });
  });

  it('accepts valid integer limit and offset params', () => {
    expect(normalizeMessagePagination(new URLSearchParams('limit=25&offset=10'))).toEqual({
      limit: 25,
      offset: 10
    });
  });

  it('falls back for malformed or negative pagination params', () => {
    expect(normalizeMessagePagination(new URLSearchParams('limit=1abc&offset=-5'))).toEqual({
      limit: 50,
      offset: 0
    });
  });

  it('rejects non-decimal integer pagination spellings', () => {
    expect(normalizeMessagePagination(new URLSearchParams('limit=1e2&offset=0x10'))).toEqual({
      limit: 50,
      offset: 0
    });
  });

  it('caps oversized limits before building the database range', () => {
    expect(normalizeMessagePagination(new URLSearchParams('limit=1000&offset=2'))).toEqual({
      limit: 100,
      offset: 2
    });
  });
});
