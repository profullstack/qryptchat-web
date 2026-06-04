'use client';
import { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';

function UserProfileInner() {
  const { username } = useParams();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/by-username/${encodeURIComponent(username)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setProfile(d.user || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  async function startChat() {
    if (!profile?.id) return;
    const res = await fetch('/api/chat/conversations', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'direct', participant_ids: [profile.id] }),
    });
    const d = await res.json();
    if (d.conversation_id) router.push(`/chat?conversation=${d.conversation_id}`);
  }

  if (loading) return <div className="container" style={{ padding: '4rem 0' }}>Loading profile...</div>;

  return (
    <div className="container" style={{ padding: '4rem 0', maxWidth: '480px' }}>
      {profile ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--color-brand-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 700, margin: '0 auto 1rem' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (profile.display_name || username).charAt(0).toUpperCase()}
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '.25rem' }}>{profile.display_name || profile.username}</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>@{profile.username}</p>
          {currentUser && currentUser.id !== profile.id && (
            <button className="btn btn-primary" onClick={startChat}>Start Chat</button>
          )}
        </div>
      ) : (
        <div>
          <h1>User @{username}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Profile not found.</p>
        </div>
      )}
    </div>
  );
}

export default function UserProfilePage() {
  return <Suspense fallback={<div>Loading...</div>}><UserProfileInner /></Suspense>;
}
