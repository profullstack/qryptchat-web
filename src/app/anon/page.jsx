'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import { useShallow } from 'zustand/react/shallow';
import { useMessagesStore } from '@/lib/stores/messages.js';
import { createSupabaseClient } from '@/lib/supabase.js';
import { keyManager } from '@/lib/crypto/key-manager.js';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';
import { postQuantumEncryption } from '@/lib/crypto/post-quantum-encryption.js';
import Message from '@/lib/components/Message.jsx';

/** Map register-anon error codes to friendly copy. */
const INVITE_ERRORS = {
	invite_used: 'This invite has already been used. Ask for a fresh one.',
	expired: 'This invite has expired. Ask for a fresh one.',
	bad_signature: 'This invite link is invalid or has been tampered with.',
	bad_format: 'This invite link is malformed.',
	unknown_issuer: 'This invite was issued by an unrecognized source.'
};

function AnonRegister() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { authenticated } = useAuthStore(useShallow((s) => ({ authenticated: !!s.user })));
	const msgs = useMessagesStore((s) => s.messages);
	const removeMsg = useMessagesStore((s) => s.remove);
	const msgStore = useMessagesStore.getState();

	const [invite, setInvite] = useState('');
	const [step, setStep] = useState('loading'); // loading | invalid | profile | backup
	const [username, setUsername] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [anonSession, setAnonSession] = useState(null);
	const [backupPin, setBackupPin] = useState('');
	const [confirmBackupPin, setConfirmBackupPin] = useState('');
	const [showBackupPin, setShowBackupPin] = useState(false);

	useEffect(() => {
		if (authenticated) {
			router.replace('/chat');
			return;
		}
		const token = searchParams.get('invite');
		if (!token || !token.startsWith('qci1.')) {
			setStep('invalid');
			return;
		}
		setInvite(token);
		setStep('profile');
	}, [authenticated, searchParams, router]);

	async function handleCreate(e) {
		e?.preventDefault();
		if (!username.trim() || submitting) return;
		setSubmitting(true);
		msgStore.clear();
		try {
			// 1. Anonymous Supabase session (no phone, no email).
			const supabase = createSupabaseClient();
			const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
			if (anonErr || !anonData?.session) {
				msgStore.error('Could not start an anonymous session. Please try again.');
				setSubmitting(false);
				return;
			}
			const session = anonData.session;

			// 2. Generate on-device post-quantum keys; share the ML-KEM-1024 public key.
			await postQuantumEncryption.initialize();
			const publicKey = await postQuantumEncryption.getPublicKey();
			await keyManager.generateUserKeys();

			// 3. Redeem the invite + create the anonymous account.
			const res = await fetch('/api/auth/register-anon', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${session.access_token}`
				},
				body: JSON.stringify({
					inviteToken: invite,
					username: username.trim(),
					displayName: displayName.trim() || username.trim(),
					publicKey
				})
			});
			const data = await res.json().catch(() => ({}));

			if (!res.ok || !data.success) {
				// Roll back the throwaway anon auth session so a retry is clean.
				await supabase.auth.signOut().catch(() => {});
				const friendly = data.code ? INVITE_ERRORS[data.code] : null;
				msgStore.error(friendly || data.error || 'Failed to create your account.');
				setSubmitting(false);
				return;
			}

			// 4. Persist session + user the same way the phone path does.
			localStorage.setItem('qrypt_user', JSON.stringify(data.user));
			localStorage.setItem('qrypt_session', JSON.stringify(session));
			useAuthStore.setState({ user: data.user });

			setAnonSession(session);
			setStep('backup');
			msgStore.success('Anonymous account created! Set a Backup PIN to protect your keys.');
		} catch {
			msgStore.error('Something went wrong creating your account. Please try again.');
		} finally {
			setSubmitting(false);
		}
	}

	async function setBackupPinFn(e) {
		e?.preventDefault();
		if (!backupPin || !/^\d+$/.test(backupPin) || backupPin.length < 6 || backupPin.length > 12) {
			msgStore.error('PIN must be 6-12 digits');
			return;
		}
		if (backupPin !== confirmBackupPin) {
			msgStore.error('PINs do not match');
			return;
		}
		setSubmitting(true);
		try {
			const headers = { 'Content-Type': 'application/json' };
			if (anonSession?.access_token) headers['Authorization'] = `Bearer ${anonSession.access_token}`;
			const pinRes = await fetch('/api/auth/backup-pin', {
				method: 'POST',
				headers,
				body: JSON.stringify({ pin: backupPin })
			});
			if (!pinRes.ok) {
				const err = await pinRes.json().catch(() => ({}));
				throw new Error(err.error || 'Failed to save PIN');
			}
			const encryptedData = await privateKeyManager.exportPrivateKeys(backupPin);
			const backupRes = await fetch('/api/auth/key-backup', {
				method: 'PUT',
				headers,
				body: JSON.stringify({ encrypted_keys: encryptedData })
			});
			if (!backupRes.ok) {
				const err = await backupRes.json().catch(() => ({}));
				throw new Error(err.error || 'Key backup failed');
			}
			msgStore.success('Backup PIN set and keys backed up! Welcome to QryptChat!');
			router.push('/chat');
		} catch (err) {
			msgStore.error('Failed to set backup PIN: ' + (err.message || 'Unknown error'));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="auth-container">
			<div className="auth-card">
				<div className="auth-header">
					<div className="logo">
						<div className="logo-icon">🕶️</div>
						<h1>QryptChat</h1>
					</div>
					<p className="subtitle">Anonymous, invite-only access</p>
				</div>

				<div className="messages-container">
					{msgs.map((m) => (
						<Message
							key={m.id}
							type={m.type}
							message={m.message}
							title={m.title}
							dismissible={m.dismissible}
							autoDismiss={m.autoDismiss}
							onDismiss={() => removeMsg(m.id)}
						/>
					))}
				</div>

				{step === 'loading' && (
					<div className="auth-step">
						<p className="step-description">Checking your invite…</p>
					</div>
				)}

				{step === 'invalid' && (
					<div className="auth-step">
						<h2>Invite required</h2>
						<p className="step-description">
							This page needs a valid anonymous invite link. Ask whoever invited you for a fresh
							<code> qrypt.chat/anon?invite=… </code> link, or sign up with a phone number instead.
						</p>
						<button className="primary-button" onClick={() => router.push('/auth')}>
							Sign up with phone
						</button>
					</div>
				)}

				{step === 'profile' && (
					<div className="auth-step">
						<h2>Create your anonymous identity</h2>
						<p className="step-description">
							No phone, no email — just pick a username. Your account is end-to-end encrypted and
							not linked to whoever invited you.
						</p>
						<form onSubmit={handleCreate}>
							<div className="input-group">
								<label htmlFor="username">Username *</label>
								<input
									id="username"
									type="text"
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									placeholder="ghost42"
									required
									disabled={submitting}
									pattern="[a-zA-Z0-9_]+"
									autoComplete="off"
								/>
							</div>
							<div className="input-group">
								<label htmlFor="displayName">Display Name</label>
								<input
									id="displayName"
									type="text"
									value={displayName}
									onChange={(e) => setDisplayName(e.target.value)}
									placeholder="Anonymous"
									disabled={submitting}
									autoComplete="off"
								/>
							</div>
							<button
								type="submit"
								disabled={submitting || !username.trim()}
								className="primary-button"
							>
								{submitting ? (
									<>
										<span className="loading-spinner" /> Creating…
									</>
								) : (
									'Create anonymous account'
								)}
							</button>
						</form>
					</div>
				)}

				{step === 'backup' && (
					<div className="auth-step">
						<h2>Set Your Backup PIN</h2>
						<p className="step-description">This PIN protects your encryption keys.</p>
						<div className="backup-warning">
							<p>
								<strong>Important:</strong> There is no phone or email on this account. If you lose
								this PIN <em>and</em> this device, your account cannot be recovered.
							</p>
						</div>
						<form onSubmit={setBackupPinFn}>
							<div className="input-group">
								<label>Backup PIN (6-12 digits) *</label>
								<div className="password-input">
									<input
										type={showBackupPin ? 'text' : 'password'}
										inputMode="numeric"
										value={backupPin}
										onChange={(e) => setBackupPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
										placeholder="Enter 6-12 digit PIN"
										required
										disabled={submitting}
										className="code-input"
									/>
									<button
										type="button"
										className="toggle-password"
										onClick={() => setShowBackupPin(!showBackupPin)}
									>
										{showBackupPin ? '👁️' : '👁️‍🗨️'}
									</button>
								</div>
							</div>
							<div className="input-group">
								<label>Confirm PIN *</label>
								<div className="password-input">
									<input
										type={showBackupPin ? 'text' : 'password'}
										inputMode="numeric"
										value={confirmBackupPin}
										onChange={(e) =>
											setConfirmBackupPin(e.target.value.replace(/\D/g, '').slice(0, 12))
										}
										placeholder="Confirm your PIN"
										required
										disabled={submitting}
										className="code-input"
									/>
								</div>
							</div>
							<div className="button-group">
								<button
									type="submit"
									disabled={submitting || !backupPin || !confirmBackupPin}
									className="primary-button"
								>
									{submitting ? (
										<>
											<span className="loading-spinner" /> Setting PIN…
										</>
									) : (
										'Set Backup PIN'
									)}
								</button>
								<button
									type="button"
									className="secondary-button"
									onClick={() => {
										msgStore.warning('Backup PIN skipped. You can set one later in Settings.');
										router.push('/chat');
									}}
								>
									Skip (Not Recommended)
								</button>
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
        .step-description code { font-family: monospace; font-size: .85em; color: var(--color-text-primary); }
        .input-group { margin-bottom: 1rem; }
        .input-group label { display: block; font-weight: 500; margin-bottom: .5rem; color: var(--color-text-primary); }
        .input-group input { width: 100%; padding: .75rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: 1rem; background: var(--color-bg-primary); color: var(--color-text-primary); }
        .input-group input:focus { outline: none; border-color: var(--color-brand-primary); box-shadow: 0 0 0 3px rgb(99 102 241 / .1); }
        .code-input { font-family: monospace; font-size: 1.25rem; text-align: center; letter-spacing: .25em; }
        .primary-button { width: 100%; padding: .75rem; background: var(--color-brand-primary); color: white; border: none; border-radius: .5rem; font-size: 1rem; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .5rem; }
        .primary-button:hover:not(:disabled) { background: var(--color-brand-secondary); }
        .primary-button:disabled { opacity: .6; cursor: not-allowed; }
        .secondary-button { width: 100%; padding: .75rem; background: var(--color-bg-secondary); color: var(--color-text-secondary); border: 1px solid var(--color-border-primary); border-radius: .5rem; font-size: .875rem; font-weight: 500; cursor: pointer; }
        .secondary-button:hover:not(:disabled) { background: var(--color-bg-tertiary); }
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
      `}</style>
		</div>
	);
}

export default function AnonPage() {
	return (
		<Suspense fallback={<div className="auth-container" />}>
			<AnonRegister />
		</Suspense>
	);
}
