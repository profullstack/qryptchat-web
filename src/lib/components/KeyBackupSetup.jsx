'use client';

import { useState } from 'react';
import { privateKeyManager } from '@/lib/crypto/private-key-manager.js';
import { PASSPHRASE_MIN, passphraseProblem } from '@/lib/crypto/key-backup-seal.js';

/**
 * Choose a backup passphrase, seal the keys in the browser, then show the
 * one-time recovery key. Used at sign-up, on sign-in (to upgrade an old PIN
 * backup) and in Settings.
 *
 * @param {{
 *   accessToken?: string,
 *   legacy?: boolean,      // an old PIN backup exists and is being replaced
 *   initialLegacyPin?: string, // that backup's PIN, when the user just restored with it
 *   onDone: () => void,
 *   onSkip?: () => void,
 *   onError?: (message: string) => void,
 *   compact?: boolean,     // Settings card styling instead of the auth page's
 * }} props
 */
export default function KeyBackupSetup({ accessToken, legacy = false, initialLegacyPin = '', onDone, onSkip, onError, compact = false }) {
	const [passphrase, setPassphrase] = useState('');
	const [confirm, setConfirm] = useState('');
	const [legacyPin, setLegacyPin] = useState(initialLegacyPin);
	const [needsPin, setNeedsPin] = useState(false);
	const [show, setShow] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [recoveryKey, setRecoveryKey] = useState('');
	const [saved, setSaved] = useState(false);

	const fail = (message) => {
		setError(message);
		onError?.(message);
	};

	async function submit(e) {
		e?.preventDefault();
		const problem = passphraseProblem(passphrase);
		if (problem) return fail(problem);
		if (passphrase !== confirm) return fail('Passphrases do not match');
		setBusy(true);
		setError('');
		try {
			const { recoveryKey: key } = await privateKeyManager.backupKeysToServer(passphrase, {
				accessToken,
				legacyPin: legacyPin || undefined
			});
			setPassphrase('');
			setConfirm('');
			setLegacyPin('');
			setRecoveryKey(key);
		} catch (err) {
			if (err?.code === 'PIN_REQUIRED' || err?.code === 'PIN_WRONG') setNeedsPin(true);
			fail(String(err?.message || 'Backup failed').replace(/^Failed to backup keys to server: /, ''));
		} finally {
			setBusy(false);
		}
	}

	const input = compact ? 'pkm-input' : 'code-input';
	const primary = compact ? 'btn btn-primary btn-sm' : 'primary-button';
	const secondary = compact ? 'btn btn-secondary btn-sm' : 'secondary-button';

	if (recoveryKey) {
		return (
			<div className="key-backup-setup">
				<p className="step-description">
					<strong>Your recovery key.</strong> It opens your backup if you forget the passphrase. It is shown only
					this once; we do not keep a copy and cannot recover your keys without it or the passphrase.
				</p>
				<pre className="recovery-key" aria-label="Recovery key">{recoveryKey}</pre>
				<div className="button-group" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
					<button type="button" className={secondary} onClick={() => navigator.clipboard?.writeText(recoveryKey).catch(() => {})}>
						Copy
					</button>
				</div>
				<label className={compact ? 'pkm-label' : 'checkbox-label'} style={{ display: 'flex', gap: '.375rem', alignItems: 'center', margin: '.75rem 0' }}>
					<input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved my recovery key somewhere safe
				</label>
				<button type="button" className={primary} disabled={!saved} onClick={() => { setRecoveryKey(''); onDone(); }}>
					Done
				</button>
				<style>{`.recovery-key { font-family: ui-monospace, monospace; font-size: 1rem; letter-spacing: .05em; padding: .75rem; border: 1px dashed currentColor; border-radius: .375rem; white-space: pre-wrap; word-break: break-all; user-select: all; }`}</style>
			</div>
		);
	}

	return (
		<form className="key-backup-setup" onSubmit={submit}>
			{legacy && (
				<p className="step-description">
					Your backup still uses a short PIN, which can be guessed if our database ever leaks. Choose a passphrase to
					re-seal it.
				</p>
			)}
			<p className="step-description" style={{ fontSize: compact ? '.8125rem' : undefined }}>
				Your keys are sealed on this device with a passphrase (at least {PASSPHRASE_MIN} characters; a few words
				works well). We never see it. If you lose both the passphrase and the recovery key we show next, your backup
				is gone and older messages cannot be read.
			</p>
			<div className="input-group">
				<input type={show ? 'text' : 'password'} autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Backup passphrase" disabled={busy} className={input} />
			</div>
			<div className="input-group">
				<input type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm passphrase" disabled={busy} className={input} />
			</div>
			{needsPin && (
				<div className="input-group">
					<input type="password" inputMode="numeric" autoComplete="current-password" value={legacyPin} onChange={(e) => setLegacyPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="Your old backup PIN (needed once to replace it)" disabled={busy} className={input} />
				</div>
			)}
			<label className={compact ? 'pkm-label' : 'checkbox-label'} style={{ display: 'flex', gap: '.375rem', alignItems: 'center' }}>
				<input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passphrase
			</label>
			{error && compact && <p style={{ color: '#991b1b', fontSize: '.8125rem' }}>{error}</p>}
			<div className="button-group" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
				<button type="submit" disabled={busy || !passphrase || !confirm} className={primary}>
					{busy ? 'Sealing...' : legacy ? 'Re-seal backup' : 'Back up keys'}
				</button>
				{onSkip && (
					<button type="button" className={secondary} onClick={onSkip}>
						Skip (not recommended)
					</button>
				)}
			</div>
		</form>
	);
}
