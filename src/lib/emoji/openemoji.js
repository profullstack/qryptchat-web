/**
 * OpenEmoji in the chat: our own emoji set, self-hosted under /openemoji.
 *
 * A message stays plain Unicode text end to end (it is what gets encrypted);
 * only the display swaps each emoji for its OpenEmoji image, with the character
 * as alt text so copy, paste and screen readers still see the emoji.
 */
import { OPENEMOJI_KEYS } from './openemoji-keys.js';

export const OPENEMOJI_BASE = '/openemoji';
export const OPENICON_SPRITE = '/openicon/sprite.svg';

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** OpenEmoji key of a character sequence: its codepoints, lowercase hex, hyphen-joined. */
export function emojiKey(char) {
  return [...char].map((c) => c.codePointAt(0).toString(16)).join('-');
}

/**
 * The key we have artwork for, or null. Text often arrives without the U+FE0F
 * presentation selector ("❤" rather than "❤️"), so try it both ways.
 */
export function artworkKey(char) {
  const key = emojiKey(char);
  if (OPENEMOJI_KEYS.has(key)) return key;
  const bare = key.split('-').filter((p) => p !== 'fe0f').join('-');
  if (OPENEMOJI_KEYS.has(bare)) return bare;
  const parts = bare.split('-');
  const qualified = [parts[0], 'fe0f', ...parts.slice(1)].join('-');
  return OPENEMOJI_KEYS.has(qualified) ? qualified : null;
}

export function emojiSrc(key) {
  return `${OPENEMOJI_BASE}/64/${key}.webp`;
}

function graphemes(text) {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

function imgTag(char, key) {
  // char reached us from the message; it is only ever emoji codepoints here
  // (it matched a key), but escape the quote anyway since it lands in attributes.
  const alt = char.replace(/"/g, '&quot;');
  return `<img class="openemoji" src="${emojiSrc(key)}" alt="${alt}" title="${alt}" draggable="false">`;
}

/**
 * Replace emoji in already-escaped HTML with OpenEmoji images. Only text
 * between tags is touched, so an emoji inside a link's href stays intact, and
 * code stays code: nothing inside <pre> or <code> is replaced.
 */
export function renderOpenEmoji(html) {
  if (!html || !PICTOGRAPHIC.test(html)) return html;
  let inCode = 0;
  return html
    .split(/(<[^>]*>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<(pre|code)\b/i.test(part)) inCode++;
        else if (/^<\/(pre|code)\s*>/i.test(part)) inCode = Math.max(0, inCode - 1);
        return part;
      }
      if (inCode > 0 || !PICTOGRAPHIC.test(part)) return part;
      return graphemes(part)
        .map((g) => {
          if (!PICTOGRAPHIC.test(g)) return g;
          const key = artworkKey(g);
          return key ? imgTag(g, key) : g;
        })
        .join('');
    })
    .join('');
}

/** True when a message is only 1 to 3 emoji (and whitespace): shown large. */
export function isEmojiOnly(text, max = 3) {
  const parts = graphemes((text || '').trim()).filter((g) => !/^\s+$/.test(g));
  return parts.length > 0 && parts.length <= max && parts.every((g) => PICTOGRAPHIC.test(g) && artworkKey(g));
}

/** Insert text at the textarea's selection; returns the new value and caret. */
export function insertAtCursor(value, selectionStart, selectionEnd, text) {
  const start = Number.isInteger(selectionStart) ? selectionStart : value.length;
  const end = Number.isInteger(selectionEnd) ? selectionEnd : start;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

let indexPromise = null;

/** The picker's index, fetched once on first open. */
export function loadEmojiIndex(fetchImpl = fetch) {
  if (!indexPromise) {
    indexPromise = fetchImpl(`${OPENEMOJI_BASE}/index.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`OpenEmoji index: HTTP ${res.status}`);
        return res.json();
      })
      .then((index) => ({
        groups: index.groups,
        emoji: index.emoji.map(([char, name, group, words]) => ({
          char,
          name,
          group,
          key: emojiKey(char),
          search: `${name} ${words}`.toLowerCase(),
        })),
      }))
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

/**
 * Every term must appear in the name or keywords. Ranked: exact name, then a
 * name that starts with the query, then one containing it, then keyword-only
 * matches; set order breaks ties ("rocket" is 🚀 before 🧑‍🚀).
 */
export function searchEmoji(emoji, query, limit = 200) {
  const q = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const terms = q.split(' ').filter(Boolean);
  if (terms.length === 0) return [];
  const ranked = [];
  emoji.forEach((e, i) => {
    if (!terms.every((t) => e.search.includes(t))) return;
    const name = e.name.toLowerCase();
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
    ranked.push([rank, i, e]);
  });
  ranked.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return ranked.slice(0, limit).map(([, , e]) => e);
}

const RECENT_KEY = 'qryptchat:recent-emoji';

export function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function pushRecent(char) {
  const list = [char, ...readRecent().filter((c) => c !== char)].slice(0, 24);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // private window or storage blocked: recents just do not persist
  }
  return list;
}
