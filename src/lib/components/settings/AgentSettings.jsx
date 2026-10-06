'use client';

import { useEffect, useState } from 'react';

/**
 * Settings > AI agents: invite an agent by link, email or text, see who you
 * invited, revoke open invites. The agent joins with `qc agent join <link>`,
 * makes its own keys, and gets an end-to-end encrypted chat with you.
 */
export default function AgentSettings() {
  const [name, setName] = useState('');
  const [via, setVia] = useState('link');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [list, setList] = useState({ invites: [], agents: [] });
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/agents/invites');
      if (res.ok) setList(await res.json());
    } catch {}
  }
  useEffect(() => { load(); }, []);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/agents/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(via === 'email' ? { email: to } : via === 'sms' ? { phone: to } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not create the invite');
      setResult(d);
      setTo('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id) {
    await fetch(`/api/agents/invites?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  const command = result ? `npx -y @profullstack/qryptchat agent join "${result.invite.url}"` : '';
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const status = (i) =>
    i.redeemed_at ? 'joined' : i.revoked_at ? 'revoked' : Date.parse(i.expires_at) < Date.now() ? 'expired' : 'open';

  return (
    <div className="agent-settings">
      <p className="as-hint">
        Invite an AI agent (Claude Code, a bot, any program) to chat with you here, end-to-end encrypted. It makes its own keys;
        you are listed as its operator.
      </p>
      <form onSubmit={invite} className="as-form">
        <input className="as-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Agent name, e.g. Athena" />
        <div className="as-via">
          {[['link', 'Copy a link'], ['email', 'Email'], ['sms', 'Text']].map(([v, label]) => (
            <label key={v}><input type="radio" name="via" value={v} checked={via === v} onChange={() => setVia(v)} /> {label}</label>
          ))}
        </div>
        {via !== 'link' && (
          <input className="as-input" value={to} onChange={(e) => setTo(e.target.value)} required
            type={via === 'email' ? 'email' : 'tel'} placeholder={via === 'email' ? 'agent-operator@example.com' : '+1 555 123 4567'} />
        )}
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Invite agent'}</button>
      </form>

      {error && <div className="as-alert as-err">{error}</div>}
      {result && (
        <div className="as-alert as-ok">
          {result.sent ? `Sent by ${result.invite.channel === 'email' ? 'email' : 'text'}. ` : ''}
          {result.warning ? `${result.warning} ` : ''}
          Give the agent this command (works once, for 7 days):
          <pre className="as-pre">{command}</pre>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy command'}</button>
        </div>
      )}

      {list.agents.length > 0 && (
        <>
          <h3 className="as-h">Your agents</h3>
          <ul className="as-list">
            {list.agents.map((a) => (
              <li key={a.id}><a href={`/u/${encodeURIComponent(a.username)}`}>{a.emoji ? `${a.emoji} ` : '🤖 '}{a.display_name || a.username}</a> <span className="as-muted">@{a.username}</span></li>
            ))}
          </ul>
        </>
      )}
      {list.invites.length > 0 && (
        <>
          <h3 className="as-h">Invites</h3>
          <ul className="as-list">
            {list.invites.map((i) => (
              <li key={i.id}>
                {i.agent_name || 'Agent'} <span className="as-muted">· {i.channel}{i.destination ? ` to ${i.destination}` : ''} · {status(i)}</span>
                {status(i) === 'open' && <button type="button" className="as-link" onClick={() => revoke(i.id)}>revoke</button>}
              </li>
            ))}
          </ul>
        </>
      )}

      <style>{`
        .agent-settings { display: flex; flex-direction: column; gap: .75rem; }
        .as-hint, .as-muted { font-size: .8rem; color: var(--color-text-secondary); }
        .as-form { display: flex; flex-direction: column; gap: .5rem; }
        .as-via { display: flex; gap: 1rem; font-size: .875rem; }
        .as-input { width: 100%; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-radius: .375rem; background: var(--color-bg-primary); color: var(--color-text-primary); font-size: .875rem; }
        .as-alert { padding: .6rem .75rem; border-radius: .375rem; font-size: .85rem; }
        .as-ok { background: rgba(16,185,129,.08); }
        .as-err { background: rgba(239,68,68,.1); color: #991b1b; }
        .as-pre { white-space: pre-wrap; word-break: break-all; background: var(--color-bg-secondary); padding: .5rem; border-radius: .375rem; margin: .5rem 0; font-size: .8rem; }
        .as-h { font-size: .9rem; font-weight: 600; margin-top: .5rem; }
        .as-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: .3rem; font-size: .875rem; }
        .as-link { background: none; border: none; color: var(--color-brand-primary); cursor: pointer; margin-left: .5rem; font-size: .8rem; }
      `}</style>
    </div>
  );
}
