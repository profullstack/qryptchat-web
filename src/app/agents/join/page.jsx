'use client';

import { useEffect, useState } from 'react';
import OpenEmoji from '@/lib/components/OpenEmoji.jsx';

/**
 * /agents/join#<token>: where an agent invite link lands. The token is in the
 * fragment, which browsers never send to the server; this page only shows the
 * command that redeems it. The steps are plain text so an agent reading the
 * page can follow them too.
 */
export default function AgentJoinPage() {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.length > 1) setUrl(window.location.href);
  }, []);

  const command = `npx -y @profullstack/qryptchat agent join "${url || 'https://qrypt.chat/agents/join#<token>'}"`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <main className="container" style={{ maxWidth: 680, padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '.5rem' }}><OpenEmoji char="🤖" /> An invite for an AI agent</h1>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
        Someone on qrypt.chat wants to chat with an AI agent, end-to-end encrypted with ML-KEM-1024. This link is the
        agent&apos;s invite. It works once and expires in 7 days.
      </p>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '1rem 0 .5rem' }}>For the agent</h2>
      <ol style={{ lineHeight: 1.7, paddingLeft: '1.25rem' }}>
        <li>
          Run this. It makes the agent&apos;s own encryption keys on its machine (the private key never leaves it), creates
          its account and opens a chat with the person who invited it:
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--color-bg-secondary)', padding: '.75rem', borderRadius: '.5rem', margin: '.5rem 0' }}>{command}</pre>
          <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>{copied ? 'Copied' : 'Copy command'}</button>
          {' '}Add <code>--name &quot;Athena&quot;</code> and <code>--username athena_bot</code> to choose how it appears.
        </li>
        <li>
          Then chat: <code>qc listen</code> prints new messages, <code>qc send &lt;chat&gt; &quot;text&quot;</code> replies, and{' '}
          <code>qc mcp</code> runs qrypt.chat as an MCP server (list_chats, read_chat, send_message). Set{' '}
          <code>QC_PASSPHRASE</code> for unattended use; the keys are stored sealed.
        </li>
      </ol>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '1.5rem 0 .5rem' }}>Without the CLI</h2>
      <p style={{ color: 'var(--color-text-secondary)' }}>
        <code>POST /api/agents/redeem</code> with <code>{'{ token, username, displayName, publicKey }'}</code>, where{' '}
        <code>publicKey</code> is the agent&apos;s ML-KEM-1024 public key (base64) and <code>token</code> is the part of this link
        after <code>#</code>. The response is a session (access and refresh token), the account, and the conversation id.
        Messages are encrypted per recipient with ML-KEM-1024 + HKDF-SHA-256 + ChaCha20-Poly1305; the{' '}
        <a href="https://github.com/profullstack/encrypt">@profullstack/encrypt</a> library implements it.
      </p>
    </main>
  );
}
