'use client';

/**
 * @fileoverview Settings panel that lets a signed-in user mint single-use
 * anonymous invite links for other people. There is no limit.
 */

import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/auth.js';

export default function InviteAnon() {
	const [minting, setMinting] = useState(false);
	const [link, setLink] = useState('');
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState('');

	async function authHeader() {
		const { session } = await useAuthStore.getState().getCurrentSession();
		if (!session?.access_token) throw new Error('You need to be signed in.');
		return { Authorization: `Bearer ${session.access_token}` };
	}

	async function createInvite() {
		setMinting(true);
		setError('');
		setCopied(false);
		setLink('');
		try {
			const headers = { ...(await authHeader()), 'Content-Type': 'application/json' };
			const res = await fetch('/api/auth/invite-anon', {
				method: 'POST',
				headers,
				body: JSON.stringify({})
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create invite');
			setLink(data.url);
		} catch (e) {
			setError(e.message);
		} finally {
			setMinting(false);
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setError('Could not copy — select and copy the link manually.');
		}
	}

	return (
		<div className="invite-anon">
			<p className="invite-desc">
				Anyone with an account can invite someone to join anonymously — no phone or email required
				for them. Each link works once and expires in 7 days, and it does not reveal that you invited
				them.
			</p>

			<button
				type="button"
				className="invite-button"
				onClick={createInvite}
				disabled={minting}
			>
				{minting ? 'Creating…' : 'Create invite link'}
			</button>

			{link && (
				<div className="invite-result">
					<input className="invite-link" type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
					<button type="button" className="invite-copy" onClick={copyLink}>
						{copied ? 'Copied!' : 'Copy'}
					</button>
				</div>
			)}

			{error && <p className="invite-error">{error}</p>}

			<style>{`
        .invite-anon { display: flex; flex-direction: column; gap: .75rem; }
        .invite-desc { color: var(--color-text-secondary); font-size: .875rem; line-height: 1.5; margin: 0; }
        .invite-button { padding: .625rem 1rem; background: var(--color-brand-primary); color: #fff; border: none; border-radius: .5rem; font-weight: 500; cursor: pointer; align-self: flex-start; }
        .invite-button:hover:not(:disabled) { background: var(--color-brand-secondary); }
        .invite-button:disabled { opacity: .6; cursor: not-allowed; }
        .invite-result { display: flex; gap: .5rem; }
        .invite-link { flex: 1; padding: .5rem .625rem; border: 1px solid var(--color-border-primary); border-radius: .5rem; background: var(--color-bg-secondary); color: var(--color-text-primary); font-family: monospace; font-size: .8rem; }
        .invite-copy { padding: .5rem .875rem; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); border-radius: .5rem; cursor: pointer; color: var(--color-text-primary); font-weight: 500; }
        .invite-copy:hover { background: var(--color-bg-tertiary); }
        .invite-error { color: #dc2626; font-size: .875rem; margin: 0; }
      `}</style>
		</div>
	);
}
