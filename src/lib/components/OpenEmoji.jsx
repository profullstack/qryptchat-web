'use client';

import { artworkKey, emojiSrc } from '@/lib/emoji/openemoji.js';

/**
 * One emoji drawn as our OpenEmoji artwork (falls back to the character when
 * the set has no picture for it). `size` is a CSS length.
 */
export default function OpenEmoji({ char, size = '1.15em', label, className = '' }) {
  const key = artworkKey(char);
  if (!key) return <span className={className}>{char}</span>;
  return (
    <img
      src={emojiSrc(key)}
      alt={label ?? char}
      title={label}
      className={`openemoji ${className}`}
      draggable={false}
      style={{ width: size, height: size, verticalAlign: '-0.2em', display: 'inline-block' }}
    />
  );
}
