import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  emojiKey,
  artworkKey,
  renderOpenEmoji,
  isEmojiOnly,
  insertAtCursor,
  searchEmoji,
  loadEmojiIndex,
} from '../src/lib/emoji/openemoji.js';
import { convertUrlsToLinks } from '../src/lib/utils/url-link-converter.js';
import { OPENEMOJI_KEYS } from '../src/lib/emoji/openemoji-keys.js';

const publicDir = resolve(__dirname, '..', 'public');

describe('OpenEmoji keys', () => {
  it('is the codepoints, lowercase hex, hyphen-joined', () => {
    expect(emojiKey('😀')).toBe('1f600');
    expect(emojiKey('❤️')).toBe('2764-fe0f');
  });

  it('finds artwork with or without the presentation selector', () => {
    expect(artworkKey('❤️')).toBe('2764-fe0f');
    expect(artworkKey('❤')).toBe('2764-fe0f');
    expect(artworkKey('😀️')).toBe('1f600');
  });

  it('has no artwork for skin-tone variants (they stay native text)', () => {
    expect(artworkKey('👍🏽')).toBeNull();
  });

  it('ships a webp for every key it claims', () => {
    expect(OPENEMOJI_KEYS.size).toBeGreaterThan(2000);
    for (const key of ['1f600', '2764-fe0f', '1f680', '1f1fa-1f1f8']) {
      expect(OPENEMOJI_KEYS.has(key)).toBe(true);
      expect(existsSync(resolve(publicDir, 'openemoji', '64', `${key}.webp`))).toBe(true);
    }
  });

  it('ships every OpenIcon symbol the UI references', () => {
    const sprite = readFileSync(resolve(publicDir, 'openicon', 'sprite.svg'), 'utf8');
    for (const name of ['smile', 'paperclip', 'send', 'search', 'clock', 'users', 'flag']) {
      expect(sprite).toContain(`id="oi-${name}"`);
    }
  });
});

describe('renderOpenEmoji', () => {
  it('swaps emoji for images, keeping the character as alt text', () => {
    expect(renderOpenEmoji('hi 😀')).toBe(
      'hi <img class="openemoji" src="/openemoji/64/1f600.webp" alt="😀" title="😀" draggable="false">'
    );
  });

  it('keeps a ZWJ sequence together', () => {
    const html = renderOpenEmoji('👩‍💻');
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toContain('/64/1f469-200d-1f4bb.webp');
  });

  it('leaves text without emoji, and unknown emoji, untouched', () => {
    expect(renderOpenEmoji('plain &amp; simple')).toBe('plain &amp; simple');
    expect(renderOpenEmoji('👍🏽')).toBe('👍🏽');
  });

  it('never rewrites inside a tag, so an href survives', () => {
    const html = renderOpenEmoji(convertUrlsToLinks('see https://example.com/😀x ok 🚀'));
    expect(html).toContain('href="https://example.com/😀x"');
    expect(html).toContain('/64/1f680.webp');
  });

  it('leaves code blocks alone', () => {
    const html = renderOpenEmoji(convertUrlsToLinks('```\n🚀\n``` 🚀'));
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(html).toMatch(/<code>[^<]*🚀[^<]*<\/code>/);
  });

  it('does not let message text become markup', () => {
    const html = renderOpenEmoji(convertUrlsToLinks('<img src=x onerror=alert(1)> 😀'));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('composer helpers', () => {
  it('detects emoji-only messages', () => {
    expect(isEmojiOnly('🚀')).toBe(true);
    expect(isEmojiOnly(' 🚀 🔥 ')).toBe(true);
    expect(isEmojiOnly('🚀🔥😀👍')).toBe(false);
    expect(isEmojiOnly('ship 🚀')).toBe(false);
    expect(isEmojiOnly('')).toBe(false);
  });

  it('inserts at the caret, replacing a selection', () => {
    expect(insertAtCursor('hello world', 5, 5, '😀')).toEqual({ value: 'hello😀 world', caret: 7 });
    expect(insertAtCursor('hello world', 6, 11, '🌍')).toEqual({ value: 'hello 🌍', caret: 8 });
    expect(insertAtCursor('hi', undefined, undefined, '!')).toEqual({ value: 'hi!', caret: 3 });
  });

  it('loads the index and searches every term', async () => {
    const raw = readFileSync(resolve(publicDir, 'openemoji', 'index.json'), 'utf8');
    const index = await loadEmojiIndex(async () => ({ ok: true, json: async () => JSON.parse(raw) }));
    expect(index.groups[0]).toBe('Smileys & Emotion');
    const hits = searchEmoji(index.emoji, 'rocket');
    expect(hits[0].char).toBe('🚀');
    expect(searchEmoji(index.emoji, 'grinning face').some((e) => e.char === '😀')).toBe(true);
    expect(searchEmoji(index.emoji, '   ')).toEqual([]);
  });
});
