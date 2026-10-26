'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import EncryptionSettings from '@/lib/components/settings/EncryptionSettings.jsx';
import PrivateKeyManager from '@/lib/components/settings/PrivateKeyManager.jsx';
import SMSNotificationSettings from '@/lib/components/settings/SMSNotificationSettings.jsx';
import WebhookSettings from '@/lib/components/settings/WebhookSettings.jsx';
import InviteAnon from '@/lib/components/settings/InviteAnon.jsx';
import PasskeySettings from '@/lib/components/settings/PasskeySettings.jsx';
import ProfileSettings from '@/lib/components/settings/ProfileSettings.jsx';
import AgentSettings from '@/lib/components/settings/AgentSettings.jsx';
import { CURRENT_BUILD } from '@/lib/app-update.js';

export default function SettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) router.replace('/auth');
  }, [user]);

  if (!user) return null;

  return (
    <div className="settings-page">
      <div className="container">
        <h1>Settings</h1>
        {/* The installed iOS app has no reload button: this says which build is running and reloads it. */}
        <p className="settings-version">
          Version {CURRENT_BUILD || 'unknown'}
          <button type="button" onClick={() => window.location.reload()}>Reload app</button>
        </p>
        <div className="settings-grid">
          <section className="settings-section-card">
            <h2>Profile</h2>
            <ProfileSettings />
          </section>
          <section className="settings-section-card">
            <h2>AI agents</h2>
            <AgentSettings />
          </section>
          <section className="settings-section-card">
            <h2>Passkeys</h2>
            <PasskeySettings />
          </section>
          <section className="settings-section-card">
            <h2>Encryption</h2>
            <EncryptionSettings />
          </section>
          <section className="settings-section-card">
            <h2>Private Keys</h2>
            <PrivateKeyManager />
          </section>
          <section className="settings-section-card">
            <h2>SMS Notifications</h2>
            <SMSNotificationSettings />
          </section>
          <section className="settings-section-card">
            <h2>Webhooks</h2>
            <WebhookSettings />
          </section>
          <section className="settings-section-card">
            <h2>Invite Anonymously</h2>
            <InviteAnon />
          </section>
        </div>
      </div>
      <style>{`
        .settings-page { padding: 2rem 0; }
        .settings-page h1 { font-size: 2rem; font-weight: 700; margin-bottom: .5rem; color: var(--color-text-primary); }
        .settings-version { display: flex; align-items: center; gap: .75rem; margin-bottom: 2rem; font-size: .8125rem; color: var(--color-text-muted); font-family: var(--font-mono, ui-monospace, monospace); }
        .settings-version button { font: inherit; font-family: inherit; padding: .2rem .6rem; border: 1px solid var(--color-border-primary); border-radius: 1rem; background: var(--color-bg-secondary); color: var(--color-text-primary); cursor: pointer; }
        .settings-grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); }
        .settings-section-card { background: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: 1rem; padding: 1.5rem; }
        .settings-section-card h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; color: var(--color-text-primary); }
        @media (max-width: 768px) { .settings-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
