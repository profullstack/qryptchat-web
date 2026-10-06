'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import EmojiPicker from '@/lib/components/chat/EmojiPicker.jsx';
import OpenEmoji from '@/lib/components/OpenEmoji.jsx';

/**
 * Settings > Profile: the public profile at /u/<username>, also served as
 * OpenProfile.md. Emoji, Pronouns and Website are OpenProfile 0.4's defaults.
 */
export default function ProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const [form, setForm] = useState({ emoji: '', pronouns: '', website: '', bio: '' });
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!user?.username) return;
    fetch(`/api/users/by-username/${encodeURIComponent(user.username)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.user ?? {};
        setForm({ emoji: p.emoji ?? '', pronouns: p.pronouns ?? '', website: p.website ?? '', bio: p.bio ?? '' });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [user?.username]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save your profile');
      setForm({ emoji: d.user.emoji ?? '', pronouns: d.user.pronouns ?? '', website: d.user.website ?? '', bio: d.user.bio ?? '' });
      setMessage({ ok: true, text: 'Profile saved.' });
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <form onSubmit={save} className="profile-settings">
      <div className="ps-row">
        <label htmlFor="ps-emoji">Emoji</label>
        <div className="ps-emoji">
          <button type="button" id="ps-emoji" className="ps-emoji-btn emoji-btn" onClick={() => setPicking((p) => !p)} aria-label="Pick your emoji">
            {form.emoji ? <OpenEmoji char={form.emoji} size="1.6rem" /> : '＋'}
          </button>
          {form.emoji && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm((f) => ({ ...f, emoji: '' }))}>Clear</button>
          )}
          <span className="ps-hint">Shown next to your name.</span>
          {picking && (
            <div className="ps-picker">
              <EmojiPicker onPick={(char) => { setForm((f) => ({ ...f, emoji: char })); setPicking(false); }} onClose={() => setPicking(false)} />
            </div>
          )}
        </div>
      </div>

      <div className="ps-row">
        <label htmlFor="ps-pronouns">Pronouns</label>
        <input id="ps-pronouns" className="ps-input" value={form.pronouns} onChange={set('pronouns')} maxLength={40} placeholder="e.g. she/her, they/them, any" disabled={!loaded} />
      </div>

      <div className="ps-row">
        <label htmlFor="ps-website">Website</label>
        <input id="ps-website" className="ps-input" value={form.website} onChange={set('website')} placeholder="https://example.com" inputMode="url" disabled={!loaded} />
      </div>

      <div className="ps-row">
        <label htmlFor="ps-bio">Bio</label>
        <textarea id="ps-bio" className="ps-input" value={form.bio} onChange={set('bio')} maxLength={500} rows={3} disabled={!loaded} />
      </div>

      <p className="ps-hint">
        Public at <a href={`/u/${encodeURIComponent(user.username)}`}>qrypt.chat/u/{user.username}</a>, and as{' '}
        <a href={`/u/${encodeURIComponent(user.username)}/openprofile.md`}>OpenProfile.md</a>. Leave a field empty to hide it.
      </p>

      {message && <div className={`ps-alert ${message.ok ? 'ps-ok' : 'ps-err'}`}>{message.text}</div>}
      <button className="btn btn-primary btn-sm" type="submit" disabled={saving || !loaded}>{saving ? 'Saving…' : 'Save profile'}</button>

      <style>{`
        .profile-settings { display: flex; flex-direction: column; gap: .75rem; }
        .ps-row { display: flex; flex-direction: column; gap: .3rem; }
        .ps-row label { font-size: .85rem; font-weight: 600; color: var(--color-text-primary); }
        .ps-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .375rem; background: var(--color-bg-primary); color: var(--color-text-primary); font-size: .875rem; font-family: inherit; }
        .ps-emoji { position: relative; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
        .ps-emoji-btn { width: 2.75rem; height: 2.75rem; font-size: 1.6rem; line-height: 1; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-primary); cursor: pointer; }
        .ps-picker { position: absolute; top: 3rem; left: 0; z-index: 20; }
        .ps-hint { font-size: .8rem; color: var(--color-text-secondary); }
        .ps-alert { padding: .5rem .75rem; border-radius: .375rem; font-size: .85rem; }
        .ps-ok { background: rgba(16,185,129,.1); color: #065f46; }
        .ps-err { background: rgba(239,68,68,.1); color: #991b1b; }
      `}</style>
    </form>
  );
}
