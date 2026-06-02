'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';
import { createSupabaseClient } from '@/lib/supabase.js';

export default function SMSNotificationSettings() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [webEnabled, setWebEnabled] = useState(false);

  useEffect(() => {
    setSmsEnabled(user?.sms_notifications_enabled ?? false);
    setWebEnabled(typeof window !== 'undefined' && localStorage.getItem('notifications-enabled') === 'true');
  }, [user?.id]);

  async function updateSMS(enabled) {
    setSmsEnabled(enabled);
    setLoading(true); setError(''); setSuccess('');
    try {
      const supabase = createSupabaseClient();
      const { error: err } = await supabase
        .from('users')
        .update({ sms_notifications_enabled: enabled })
        .eq('id', user.id);
      if (err) throw err;
      updateUser({ sms_notifications_enabled: enabled });
      setSuccess('SMS notification preference saved.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update SMS preference');
    } finally { setLoading(false); }
  }

  async function updateWebNotifications(enabled) {
    setWebEnabled(enabled);
    localStorage.setItem('notifications-enabled', String(enabled));
    if (enabled && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setWebEnabled(false);
        localStorage.setItem('notifications-enabled', 'false');
        setError('Browser notifications were denied. Please enable them in your browser settings.');
        return;
      }
    }
    setSuccess(`Browser notifications ${enabled ? 'enabled' : 'disabled'}.`);
    setTimeout(() => setSuccess(''), 3000);
  }

  return (
    <div>
      {error && <div style={{ background: 'rgba(239,68,68,.1)', color: '#991b1b', border: '1px solid #fca5a5', padding: '.625rem .875rem', borderRadius: '.375rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{error}</div>}
      {success && <div style={{ background: 'rgba(16,185,129,.1)', color: '#065f46', border: '1px solid #6ee7b7', padding: '.625rem .875rem', borderRadius: '.375rem', fontSize: '.875rem', marginBottom: '.75rem' }}>{success}</div>}

      <div className="notif-row">
        <div>
          <div className="notif-label">SMS Notifications</div>
          <div className="notif-desc">Receive SMS alerts for new messages when offline</div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={smsEnabled} onChange={(e) => updateSMS(e.target.checked)} disabled={loading || !user} />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="notif-row">
        <div>
          <div className="notif-label">Browser Notifications</div>
          <div className="notif-desc">Show desktop notifications for new messages</div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={webEnabled} onChange={(e) => updateWebNotifications(e.target.checked)} />
          <span className="toggle-slider" />
        </label>
      </div>

      <style>{`
        .notif-row { display: flex; justify-content: space-between; align-items: center; padding: .75rem 0; border-bottom: 1px solid var(--color-border-primary); }
        .notif-row:last-of-type { border-bottom: none; }
        .notif-label { font-weight: 500; font-size: .9375rem; color: var(--color-text-primary); }
        .notif-desc { font-size: .8125rem; color: var(--color-text-secondary); margin-top: .125rem; }
        .toggle { position: relative; width: 44px; height: 24px; flex-shrink: 0; cursor: pointer; }
        .toggle input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; inset: 0; background: var(--color-border-secondary); border-radius: 999px; transition: .2s; }
        .toggle-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .2s; }
        .toggle input:checked + .toggle-slider { background: var(--color-brand-primary); }
        .toggle input:checked + .toggle-slider::before { transform: translateX(20px); }
      `}</style>
    </div>
  );
}
