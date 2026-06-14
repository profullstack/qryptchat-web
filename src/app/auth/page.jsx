'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import { useShallow } from 'zustand/react/shallow';
import { useMessagesStore } from '@/lib/stores/messages.js';
import { createSupabaseClient } from '@/lib/supabase.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';
import { indexedDBManager } from '@/lib/crypto/indexed-db-manager.js';
import Message from '@/lib/components/Message.jsx';

export default function AuthPage() {
  const router = useRouter();
  const { user, isAuthenticated: authenticated, loading, sendSMS, verifySMS } = useAuthStore(
    useShallow((s) => ({ user: s.user, isAuthenticated: !!s.user, loading: s.loading, sendSMS: s.sendSMS, verifySMS: s.verifySMS }))
  );
  const msgs = useMessagesStore((s) => s.messages);
  const removeMsg = useMessagesStore((s) => s.remove);

  const [step, setStep] = useState('phone');
  const [verifying, setVerifying] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [canResend, setCanResend] = useState(true);
  const [verifiedSession, setVerifiedSession] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [backupPin, setBackupPin] = useState('');
  const [confirmBackupPin, setConfirmBackupPin] = useState('');
  const [showBackupPin, setShowBackupPin] = useState(false);
  const [restorePin, setRestorePin] = useState('');
  const [showRestorePin, setShowRestorePin] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreAttempts, setRestoreAttempts] = useState(0);
  const MAX_RESTORE = 5;
  const msgStore = useMessagesStore.getState();

  useEffect(() => {
    if (authenticated) router.replace('/chat');
  }, [authenticated]);

  function formatPhoneNumber(value) {
    const clean = value.replace(/[^\d+]/g, '');
    if (clean.length > 0 && !clean.startsWith('+')) return '+' + clean;
    return clean;
  }

  function startCountdown(seconds) {
    setCountdown(seconds);
    setCanResend(false);
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(interval); setCanResend(true); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleSendSMS(e) {
    e?.preventDefault();
    if (!phoneNumber.trim()) return;
    const result = await sendSMS(phoneNumber);
    if (result.success) {
      setStep('verify');
      startCountdown(60);
    }
  }

  async function handleVerifySMS(e) {
    e?.preventDefault();
    if (verificationCode.length !== 6 || verifying || loading) return;
    setVerifying(true);
    const result = await verifySMS(phoneNumber, verificationCode);
    if (!result.success && !result.requiresUsername) setVerifying(false);

    if (result.success) {
      if (result.isNewUser) {
        router.push('/chat');
      } else {
        const sessionToken = result.session?.access_token;
        const authHeaders = sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {};
        try {
          const hasLocalKeys = await indexedDBManager.get('qryptchat_pq_keypair');
          const backupRes = await fetch('/api/auth/key-backup', { headers: authHeaders });
          const hasBackup = backupRes.ok;
          const pinCheckRes = await fetch('/api/auth/backup-pin', { headers: authHeaders });
          const pinData = pinCheckRes.ok ? await pinCheckRes.json() : { hasPin: false };
          if (hasBackup && !hasLocalKeys) {
            setVerifiedSession(result.session);
            setStep('restore');
            return;
          }
          if (!pinData.hasPin && hasLocalKeys) {
            setVerifiedSession(result.session);
            setStep('backup');
            return;
          }
        } catch { setVerifiedSession(result.session); setStep('restore'); return; }
        router.push('/chat');
      }
    } else if (result.requiresUsername) {
      setVerifiedSession(result.session);
      setStep('profile');
    }
  }

  function handleCodeInput(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(val);
    if (val.length === 6) setTimeout(handleVerifySMS, 100);
  }

  async function completeProfile(e) {
    e?.preventDefault();
    if (!username.trim() || !verifiedSession?.access_token) return;
    try {
      const headers = { 'Authorization': `Bearer ${verifiedSession.access_token}`, 'Content-Type': 'application/json' };
      const res = await fetch('/api/auth/verify-sms', { method: 'POST', headers, body: JSON.stringify({ phoneNumber, username, displayName: displayName || username, useSession: true }) });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('qrypt_user', JSON.stringify(data.user));
        localStorage.setItem('supabase.auth.token', JSON.stringify(verifiedSession));
        const supabase = createSupabaseClient();
        await supabase.auth.setSession(verifiedSession);
        try {
          await keyManager.generateUserKeys();
          setStep('backup');
          msgStore.success('Account created! Please set a Backup PIN.');
        } catch { msgStore.warning('Account created but failed to generate encryption keys.'); router.push('/chat'); }
      } else { msgStore.error(data.error || 'Failed to create account'); }
    } catch { msgStore.error('Failed to create account. Please try again.'); }
  }

  async function setBackupPinFn(e) {
    e?.preventDefault();
    if (!backupPin || !/^\d+$/.test(backupPin) || backupPin.length < 6 || backupPin.length > 12) { msgStore.error('PIN must be 6-12 digits'); return; }
    if (backupPin !== confirmBackupPin) { msgStore.error('PINs do not match'); return; }
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (verifiedSession?.access_token) headers['Authorization'] = `Bearer ${verifiedSession.access_token}`;
      const pinRes = await fetch('/api/auth/backup-pin', { method: 'POST', headers, body: JSON.stringify({ pin: backupPin }) });
      if (!pinRes.ok) { const err = await pinRes.json().catch(() => ({})); throw new Error(err.error || 'Failed to save PIN'); }
      const encryptedData = await privateKeyManager.exportPrivateKeys(backupPin);
      const backupHeaders = { 'Content-Type': 'application/json' };
      if (verifiedSession?.access_token) backupHeaders['Authorization'] = `Bearer ${verifiedSession.access_token}`;
      const backupRes = await fetch('/api/auth/key-backup', { method: 'PUT', headers: backupHeaders, body: JSON.stringify({ encrypted_keys: encryptedData }) });
      if (!backupRes.ok) { const e = await backupRes.json().catch(() => ({})); throw new Error(e.error || 'Key backup failed'); }
      msgStore.success('Backup PIN set and keys backed up! Welcome to QryptChat!');
      router.push('/chat');
    } catch (err) { msgStore.error('Failed to set backup PIN: ' + (err.message || 'Unknown error')); }
  }

  async function restoreWithPin(e) {
    e?.preventDefault();
    if (!restorePin || restoreAttempts >= MAX_RESTORE) return;
    setIsRestoring(true);
    try {
      await privateKeyManager.restoreKeysFromServer(restorePin);
      msgStore.success('Encryption keys restored successfully!');
      setRestorePin(''); setRestoreAttempts(0);
      router.push('/chat');
    } catch {
      const remaining = MAX_RESTORE - restoreAttempts - 1;
      setRestoreAttempts((a) => a + 1);
      setRestorePin('');
      if (remaining <= 0) msgStore.error('Too many failed attempts.');
      else msgStore.error(`Wrong PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    } finally { setIsRestoring(false); }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo"><div className="logo-icon">🔐</div><h1>QryptChat</h1></div>
          <p className="subtitle">Secure, quantum-resistant messaging</p>
        </div>

        <div className="messages-container">
          {msgs.map((m) => <Message key={m.id} type={m.type} message={m.message} title={m.title} dismissible={m.dismissible} autoDismiss={m.autoDismiss} onDismiss={() => removeMsg(m.id)} />)}
        </div>

        {step === 'phone' && (
          <div className="auth-step">
            <h2>Enter your phone number</h2>
            <p className="step-description">We'll send you a verification code via SMS</p>
            <form onSubmit={handleSendSMS}>
              <div className="input-group">
                <label htmlFor="phone">Phone Number</label>
                <input id="phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(formatPhoneNumber(e.target.value))} placeholder="+1234567890" required disabled={loading} className="phone-input" />
              </div>
              <button type="submit" disabled={loading || !phoneNumber.trim()} className="primary-button">
                {loading ? <><span className="loading-spinner" /> Sending...</> : 'Send Code'}
              </button>
            </form>
            <div className="auth-divider"><span>or</span></div>
            <a href="/api/auth/coinpay/login" className="coinpay-button">
              <span className="coinpay-icon">🪙</span> Log in with CoinPay
            </a>
          </div>
        )}

        {step === 'verify' && (
          <div className="auth-step">
            <button className="back-button" onClick={() => setStep('phone')}>← Back</button>
            <h2>Enter verification code</h2>
            <p className="step-description">Code sent to <strong>{phoneNumber}</strong></p>
            <form onSubmit={handleVerifySMS}>
              <div className="input-group">
                <label htmlFor="code">Verification Code</label>
                <input id="code" type="text" value={verificationCode} onChange={handleCodeInput} placeholder="123456" maxLength={6} required disabled={loading} className="code-input" />
              </div>
              <button type="submit" disabled={loading || verificationCode.length !== 6} className="primary-button">
                {loading ? <><span className="loading-spinner" /> Verifying...</> : 'Verify'}
              </button>
            </form>
            <div className="resend-section">
              {canResend ? <button className="link-button" onClick={handleSendSMS}>Resend code</button> : <span className="countdown">Resend in {countdown}s</span>}
            </div>
          </div>
        )}

        {step === 'profile' && (
          <div className="auth-step">
            <button className="back-button" onClick={() => setStep('verify')}>← Back</button>
            <h2>Create your profile</h2>
            <p className="step-description">Choose a username to get started</p>
            <form onSubmit={completeProfile}>
              <div className="input-group">
                <label htmlFor="username">Username *</label>
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="johndoe" required disabled={loading} pattern="[a-zA-Z0-9_]+" />
              </div>
              <div className="input-group">
                <label htmlFor="displayName">Display Name</label>
                <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="John Doe" disabled={loading} />
              </div>
              <button type="submit" disabled={loading || !username.trim()} className="primary-button">
                {loading ? <><span className="loading-spinner" /> Creating...</> : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        {step === 'backup' && (
          <div className="auth-step">
            <h2>Set Your Backup PIN</h2>
            <p className="step-description">This PIN protects your encryption keys.</p>
            <div className="backup-warning"><p><strong>Important:</strong> Remember this PIN! Without it, you cannot restore your encryption keys.</p></div>
            <form onSubmit={setBackupPinFn}>
              <div className="input-group">
                <label>Backup PIN (6-12 digits) *</label>
                <div className="password-input">
                  <input type={showBackupPin ? 'text' : 'password'} inputMode="numeric" value={backupPin} onChange={(e) => setBackupPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter 6-12 digit PIN" required disabled={loading} className="code-input" />
                  <button type="button" className="toggle-password" onClick={() => setShowBackupPin(!showBackupPin)}>{showBackupPin ? '👁️' : '👁️‍🗨️'}</button>
                </div>
              </div>
              <div className="input-group">
                <label>Confirm PIN *</label>
                <div className="password-input">
                  <input type={showBackupPin ? 'text' : 'password'} inputMode="numeric" value={confirmBackupPin} onChange={(e) => setConfirmBackupPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Confirm your PIN" required disabled={loading} className="code-input" />
                </div>
              </div>
              <div className="button-group">
                <button type="submit" disabled={loading || !backupPin || !confirmBackupPin} className="primary-button">
                  {loading ? <><span className="loading-spinner" /> Setting PIN...</> : 'Set Backup PIN'}
                </button>
                <button type="button" className="secondary-button" onClick={() => { msgStore.warning('Backup PIN skipped. You can set one later in Settings.'); router.push('/chat'); }}>Skip (Not Recommended)</button>
              </div>
            </form>
          </div>
        )}

        {step === 'restore' && (
          <div className="auth-step">
            <h2>Restore Your Encryption Keys</h2>
            <p className="step-description">Enter your Backup PIN to restore your encryption keys on this device.</p>
            <form onSubmit={restoreWithPin}>
              <div className="input-group">
                <label>Backup PIN *</label>
                <div className="password-input">
                  <input type={showRestorePin ? 'text' : 'password'} inputMode="numeric" value={restorePin} onChange={(e) => setRestorePin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Enter your PIN" required disabled={isRestoring} className="code-input" />
                  <button type="button" className="toggle-password" onClick={() => setShowRestorePin(!showRestorePin)}>{showRestorePin ? '👁️' : '👁️‍🗨️'}</button>
                </div>
              </div>
              <div className="button-group">
                <button type="submit" disabled={isRestoring || !restorePin} className="primary-button">
                  {isRestoring ? <><span className="loading-spinner" /> Restoring...</> : 'Restore Keys'}
                </button>
                <button type="button" className="secondary-button" onClick={() => { msgStore.warning('Key restore skipped.'); router.push('/chat'); }}>Skip</button>
              </div>
            </form>
          </div>
        )}

        <div className="auth-footer">
          <p className="privacy-note">Your data is encrypted end-to-end. We cannot read your messages.</p>
        </div>
      </div>

      <style>{`
        .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1rem; background: linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-tertiary) 100%); }
        .auth-card { background: var(--color-bg-primary); border-radius: 1rem; padding: 2rem; width: 100%; max-width: 400px; box-shadow: var(--shadow-lg); border: 1px solid var(--color-border-primary); }
        .auth-header { text-align: center; margin-bottom: 2rem; }
        .logo { display: flex; align-items: center; justify-content: center; gap: .5rem; margin-bottom: .5rem; }
        .logo-icon { font-size: 2rem; }
        .logo h1 { font-size: 1.5rem; font-weight: 700; color: var(--color-brand-primary); margin: 0; }
        .subtitle { color: var(--color-text-secondary); margin: 0; }
        .auth-step h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: .5rem; color: var(--color-text-primary); }
        .step-description { color: var(--color-text-secondary); margin-bottom: 1.5rem; line-height: 1.5; }
        .input-group { margin-bottom: 1rem; }
        .input-group label { display: block; font-weight: 500; margin-bottom: .5rem; color: var(--color-text-primary); }
        .input-group input { width: 100%; padding: .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: 1rem; background: var(--color-bg-primary); color: var(--color-text-primary); }
        .input-group input:focus { outline: none; border-color: var(--color-brand-primary); box-shadow: 0 0 0 3px rgb(99 102 241 / .1); }
        .phone-input, .code-input { font-family: monospace; letter-spacing: .05em; }
        .code-input { font-size: 1.25rem; text-align: center; letter-spacing: .25em; }
        .primary-button { width: 100%; padding: .75rem; background: var(--color-brand-primary); color: white; border: none; border-radius: .5rem; font-size: 1rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .5rem; }
        .primary-button:hover:not(:disabled) { background: var(--color-brand-secondary); }
        .primary-button:disabled { opacity: .6; cursor: not-allowed; }
        .secondary-button { width: 100%; padding: .75rem; background: var(--color-bg-secondary); color: var(--color-text-secondary); border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: .875rem; font-weight: 500; cursor: pointer; }
        .secondary-button:hover:not(:disabled) { background: var(--color-bg-tertiary); }
        .back-button, .link-button { background: none; border: none; color: var(--color-brand-primary); cursor: pointer; font-size: .875rem; padding: 0; }
        .back-button { margin-bottom: 1rem; display: block; }
        .link-button { text-decoration: underline; }
        .resend-section { text-align: center; margin-top: 1rem; }
        .countdown { color: var(--color-text-secondary); font-size: .875rem; }
        .messages-container { margin-bottom: 1rem; }
        .loading-spinner { width: 1rem; height: 1rem; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .auth-footer { margin-top: 2rem; text-align: center; }
        .privacy-note { font-size: .75rem; color: var(--color-text-secondary); }
        .backup-warning { background: rgba(239,68,68,.1); border: 1px solid #ef4444; border-radius: .375rem; padding: 1rem; margin: 1rem 0; }
        .backup-warning p { color: #dc2626; margin: 0; font-weight: 500; font-size: .875rem; }
        .button-group { display: flex; flex-direction: column; gap: .75rem; margin-top: 1.5rem; }
        .password-input { position: relative; display: flex; align-items: center; }
        .password-input input { padding-right: 3rem; }
        .toggle-password { position: absolute; right: .75rem; background: none; border: none; cursor: pointer; font-size: 1rem; }
        .auth-divider { display: flex; align-items: center; text-align: center; margin: 1.25rem 0; color: var(--color-text-secondary); font-size: .75rem; }
        .auth-divider::before, .auth-divider::after { content: ''; flex: 1; border-bottom: 1px solid var(--color-border-primary); }
        .auth-divider span { padding: 0 .75rem; }
        .coinpay-button { width: 100%; box-sizing: border-box; padding: .75rem; background: var(--color-bg-secondary); color: var(--color-text-primary); border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: 1rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .5rem; text-decoration: none; }
        .coinpay-button:hover { background: var(--color-bg-tertiary); }
        .coinpay-icon { font-size: 1.1rem; }
      `}</style>
    </div>
  );
}
