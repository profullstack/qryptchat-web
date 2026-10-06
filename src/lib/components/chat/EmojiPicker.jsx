'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadEmojiIndex, searchEmoji, readRecent, pushRecent, emojiSrc, OPENICON_SPRITE } from '@/lib/emoji/openemoji.js';

/** OpenIcon glyph per OpenEmoji group, in the set's own group order. */
const GROUP_ICONS = {
  'Smileys & Emotion': 'smile',
  'People & Body': 'users',
  'Animals & Nature': 'leaf',
  'Food & Drink': 'coffee',
  'Travel & Places': 'globe',
  Activities: 'trophy',
  Objects: 'lightbulb',
  Symbols: 'hash',
  Flags: 'flag',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`${OPENICON_SPRITE}#oi-${name}`} />
    </svg>
  );
}

const RECENT = 'recent';

/**
 * The OpenEmoji picker. It only ever hands back a Unicode character through
 * onPick: what the message stores (and encrypts) is plain text.
 */
export default function EmojiPicker({ onPick, onClose }) {
  const [index, setIndex] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(() => readRecent());
  const [tab, setTab] = useState(() => (readRecent().length ? RECENT : 0));
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    let live = true;
    loadEmojiIndex()
      .then((i) => live && setIndex(i))
      .catch((err) => live && setError(err.message));
    searchRef.current?.focus();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target) && !e.target.closest?.('.emoji-btn')) onClose?.();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [onClose]);

  const byChar = useMemo(() => new Map((index?.emoji || []).map((e) => [e.char, e])), [index]);

  const shown = useMemo(() => {
    if (!index) return [];
    if (query.trim()) return searchEmoji(index.emoji, query);
    if (tab === RECENT) return recent.map((c) => byChar.get(c)).filter(Boolean);
    return index.emoji.filter((e) => e.group === tab);
  }, [index, query, tab, recent, byChar]);

  function pick(e) {
    setRecent(pushRecent(e.char));
    onPick(e.char);
  }

  return (
    <div className="emoji-picker" ref={rootRef} role="dialog" aria-label="Emoji">
      <div className="emoji-search">
        <Icon name="search" size={16} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search emoji"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search emoji"
        />
      </div>

      {!query.trim() && (
        <div className="emoji-tabs" role="tablist">
          {recent.length > 0 && (
            <button type="button" role="tab" aria-selected={tab === RECENT} className={tab === RECENT ? 'active' : ''} onClick={() => setTab(RECENT)} title="Recent">
              <Icon name="clock" />
            </button>
          )}
          {(index?.groups || Object.keys(GROUP_ICONS)).map((g, i) => (
            <button type="button" role="tab" key={g} aria-selected={tab === i} className={tab === i ? 'active' : ''} onClick={() => setTab(i)} title={g}>
              <Icon name={GROUP_ICONS[g] || 'smile'} />
            </button>
          ))}
        </div>
      )}

      <div className="emoji-grid">
        {error && <p className="emoji-empty">Emoji could not load: {error}</p>}
        {!error && !index && <p className="emoji-empty">Loading…</p>}
        {index && shown.length === 0 && <p className="emoji-empty">{query.trim() ? 'No emoji match.' : 'Nothing here yet.'}</p>}
        {shown.map((e) => (
          <button type="button" key={e.key} className="emoji-cell" title={e.name} aria-label={e.name} onClick={() => pick(e)}>
            <img src={emojiSrc(e.key)} alt={e.char} width="28" height="28" loading="lazy" draggable="false" />
          </button>
        ))}
      </div>

      <div className="emoji-credit">OpenEmoji by Profullstack, Inc. (CC BY 4.0)</div>

      <style>{`
        .emoji-picker { position: absolute; bottom: calc(100% + .5rem); left: .75rem; width: min(352px, calc(100vw - 2rem)); height: 380px; display: flex; flex-direction: column; background: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: .75rem; box-shadow: 0 10px 30px rgba(0,0,0,.25); z-index: 20; overflow: hidden; }
        .emoji-search { display: flex; align-items: center; gap: .4rem; margin: .5rem; padding: .35rem .6rem; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); border-radius: .5rem; color: var(--color-text-muted); }
        .emoji-search input { flex: 1; border: none; background: transparent; outline: none; color: var(--color-text-primary); font: inherit; font-size: .875rem; }
        .emoji-tabs { display: flex; justify-content: space-between; padding: 0 .35rem; border-bottom: 1px solid var(--color-border-primary); }
        .emoji-tabs button { flex: 1; display: flex; justify-content: center; padding: .4rem 0; background: none; border: none; border-bottom: 2px solid transparent; color: var(--color-text-muted); cursor: pointer; }
        .emoji-tabs button:hover { color: var(--color-text-primary); }
        .emoji-tabs button.active { color: var(--color-brand-primary); border-bottom-color: var(--color-brand-primary); }
        .emoji-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); align-content: start; padding: .35rem; }
        .emoji-cell { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: none; border: none; border-radius: .5rem; cursor: pointer; }
        .emoji-cell:hover, .emoji-cell:focus-visible { background: var(--color-bg-tertiary); }
        .emoji-empty { grid-column: 1 / -1; padding: 1rem; text-align: center; color: var(--color-text-muted); font-size: .875rem; }
        .emoji-credit { padding: .25rem .6rem; font-size: .6875rem; color: var(--color-text-muted); border-top: 1px solid var(--color-border-primary); }
      `}</style>
    </div>
  );
}
