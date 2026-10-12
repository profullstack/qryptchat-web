import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { emojiKey, artworkKey } from './openemoji.js';

describe('emojiKey', () => {
  it('pads codepoints to four hex digits like the OpenEmoji files', () => {
    expect(emojiKey('😀')).toBe('1f600');
    expect(emojiKey('#️⃣')).toBe('0023-fe0f-20e3');
    expect(emojiKey('©️')).toBe('00a9-fe0f');
    expect(artworkKey('©')).toBe('00a9-fe0f');
  });

  it('has an image for every emoji the picker lists', () => {
    const index = JSON.parse(readFileSync('public/openemoji/index.json', 'utf8'));
    const missing = index.emoji.filter(([char]) => !existsSync(`public/openemoji/64/${emojiKey(char)}.webp`));
    expect(missing.map(([c]) => c)).toEqual([]);
  });
});
