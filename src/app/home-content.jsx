'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/lib/hooks/useI18n.js';

const INSTALL_CMD = 'curl -fsSL https://qrypt.chat/install.sh | sh';

export default function HomeContent() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied); the command stays selectable.
    }
  };

  return (
    <>
      <div className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">{t('app.name')}</h1>
              <p className="hero-tagline">{t('app.tagline')}</p>
              <p className="hero-description">{t('app.description')}</p>
              <div className="hero-actions">
                <Link href="/auth" className="btn btn-primary">{t('nav.register')}</Link>
                <Link href="/auth" className="btn btn-secondary">{t('nav.login')}</Link>
              </div>
              <div className="hero-install">
                <span className="hero-install-label">Terminal client (qc): TUI, CLI and MCP</span>
                <div className="hero-install-cmd">
                  <span className="hero-install-prompt" aria-hidden="true">$</span>
                  <code>{INSTALL_CMD}</code>
                  <button type="button" className="hero-install-copy" onClick={copyInstall} aria-label="Copy install command">
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <img src="/hero.svg" alt="Illustration of a locked, end-to-end encrypted QryptChat conversation protected by post-quantum cryptography" className="hero-image" width="500" height="500" />
            </div>
          </div>
        </div>
      </div>

      <section className="agents-voice" aria-labelledby="agents-voice-title">
        <div className="container">
          <div className="agents-voice-inner">
            <div className="agents-voice-copy">
              <span className="agents-voice-badge">🎙️ New</span>
              <h2 id="agents-voice-title">Voice chat with your AI agents</h2>
              <p className="agents-voice-lede">
                Invite your agents to a group, give them names, and just talk. They join the call, listen,
                take turns like people, and answer out loud in their own voices. Ask for real work and they
                get on it, then tell you how it went.
              </p>
              <ol className="agents-voice-steps">
                <li><strong>Invite your agents.</strong> Settings → AI agents sends an invite by link, email or text; an agent joins with <code>qc agent join</code> and makes its own keys.</li>
                <li><strong>Name them and add them to a group.</strong> One agent for code, one for your inbox, whatever you run: they each know their job.</li>
                <li><strong>Tap the mic.</strong> A voice call starts, your agents join, and you talk. Everything they say is also written into the chat.</li>
              </ol>
              <Link href="/auth" className="btn btn-primary agents-voice-cta">Start talking to your agents</Link>
            </div>
            <div className="agents-voice-call" aria-hidden="true">
              <div className="call-line you"><span>You</span>riotcoder, is the deploy green?</div>
              <div className="call-line agent"><span>🤖 riotcoder</span>Yep, all green. Want me to post the release notes?</div>
              <div className="call-line agent alt"><span>🤖 cha0spunk</span>And your inbox is clear, nothing waiting.</div>
              <div className="call-foot">🔒 End-to-end encrypted voice call</div>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <div className="section-header">
            <h2>Why Choose QryptChat?</h2>
            <p>Built for the future of secure communication</p>
          </div>
          <div className="features-grid">
            {[
              { num: '01', title: 'Post-Quantum Cryptography', desc: 'Uses ML-KEM-1024 (CRYSTALS-Kyber) and CRYSTALS-Dilithium algorithms approved by NIST for quantum resistance.' },
              { num: '02', title: 'Phone Number Authentication', desc: 'Simple and secure registration using your phone number with SMS verification.' },
              { num: '03', title: '🔐 Encrypted Voice & Video Calls', desc: 'Crystal-clear 1:1 and group calls protected with ML-KEM-1024 post-quantum encryption.' },
              { num: '04', title: 'Real-time Messaging', desc: 'Instant message delivery with typing indicators and read receipts.' },
              { num: '05', title: 'Multi-language Support', desc: 'Available in multiple languages with full internationalization support.' },
              { num: '06', title: '🤖 Voice Chat With Your AI Agents', desc: 'Invite your agents to a group, name them, and talk: they join an encrypted call and answer in their own voices.' },
            ].map(({ num, title, desc }) => (
              <div key={num} className="feature-item">
                <div className="feature-number">{num}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How QryptChat Works</h2>
            <p>Private by design — no email, no passwords, no message access.</p>
          </div>
          <ol className="steps">
            <li><strong>Register with a phone number.</strong> A one-time SMS code verifies you — no email address and no password to leak.</li>
            <li><strong>Keys are generated on your device.</strong> Your ML-KEM-1024 key pair never leaves your device, so QryptChat cannot read your messages.</li>
            <li><strong>Every message is encrypted end-to-end.</strong> Text, files, and voice &amp; video calls are protected with NIST-approved post-quantum algorithms.</li>
            <li><strong>Stay private, everywhere.</strong> Use QryptChat on the web or over Tor, and self-host it from the open-source (MIT) repository.</li>
          </ol>
          <p className="audience">
            Built for privacy-conscious individuals, journalists, activists, and security-minded teams who need
            communication that stays private even against future quantum computers.
          </p>
        </div>
      </section>

      <style>{`
        .how-it-works { padding: var(--space-20) 0; }
        .steps { max-width: 760px; margin: 0 auto; padding-left: var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
        .steps li { color: var(--color-text-secondary); line-height: 1.7; font-size: 1.0625rem; }
        .steps li strong { color: var(--color-text-primary); }
        .audience { max-width: 760px; margin: var(--space-8) auto 0; text-align: center; color: var(--color-text-secondary); line-height: 1.7; }
        .agents-voice { padding: var(--space-20) 0; background: var(--color-bg-primary); }
        .agents-voice-inner { display: grid; grid-template-columns: 1.2fr 1fr; gap: var(--space-12); align-items: center; }
        .agents-voice-badge { display: inline-block; padding: var(--space-1) var(--space-3); border-radius: 999px; background: var(--color-bg-secondary); border: 1px solid var(--color-border-primary); font-size: .8125rem; font-weight: 600; color: var(--color-brand-primary); margin-bottom: var(--space-4); }
        .agents-voice h2 { font-size: 2.5rem; font-weight: 800; line-height: 1.15; color: var(--color-text-primary); margin-bottom: var(--space-4); }
        .agents-voice-lede { font-size: 1.1875rem; line-height: 1.7; color: var(--color-text-secondary); margin-bottom: var(--space-6); }
        .agents-voice-steps { padding-left: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-8); color: var(--color-text-secondary); line-height: 1.6; }
        .agents-voice-steps strong { color: var(--color-text-primary); }
        .agents-voice-steps code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; background: var(--color-bg-secondary); padding: 0 .3em; border-radius: 4px; }
        .agents-voice-cta { padding: var(--space-4) var(--space-8); font-size: 1.0625rem; font-weight: 600; }
        .agents-voice-call { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-6); border-radius: var(--radius-xl); background: linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-secondary) 100%); box-shadow: var(--shadow-xl); }
        .call-line { max-width: 85%; padding: var(--space-3) var(--space-4); border-radius: 1rem; background: rgba(255,255,255,.95); color: #1a1a2e; line-height: 1.45; font-size: .9375rem; }
        .call-line span { display: block; font-size: .75rem; font-weight: 700; opacity: .65; margin-bottom: 2px; }
        .call-line.you { align-self: flex-end; background: rgba(0,0,0,.35); color: #fff; }
        .call-line.alt { background: rgba(255,255,255,.85); }
        .call-foot { color: rgba(255,255,255,.85); font-size: .8125rem; text-align: center; margin-top: var(--space-2); }
        @media (max-width: 768px) {
          .agents-voice-inner { grid-template-columns: 1fr; }
          .agents-voice h2 { font-size: 2rem; }
        }
      `}</style>

      <style>{`
        .hero {
          background: linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-secondary) 100%);
          color: white;
          padding: var(--space-20) 0;
          min-height: 80vh;
          display: flex;
          align-items: center;
        }
        .hero-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-16);
          align-items: center;
        }
        .hero-title {
          font-size: 3.5rem;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: var(--space-4);
          background: linear-gradient(45deg, #ffffff, #e2e8f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        /* Grid items default to min-width:auto, so the nowrap install command stretched the page on phones. */
        .hero-text, .hero-visual, .agents-voice-copy, .agents-voice-call { min-width: 0; }
        .hero-tagline { font-size: 1.5rem; font-weight: 600; margin-bottom: var(--space-4); opacity: 0.9; }
        .hero-description { font-size: 1.125rem; line-height: 1.7; margin-bottom: var(--space-8); opacity: 0.8; }
        .hero-actions { display: flex; gap: var(--space-4); }
        .hero-actions .btn { padding: var(--space-4) var(--space-8); font-size: 1.125rem; font-weight: 600; }
        .hero-actions .btn-primary { background-color: white; color: var(--color-brand-primary); border-color: white; }
        .hero-actions .btn-primary:hover { background-color: var(--color-bg-secondary); transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,.2); }
        .hero-actions .btn-secondary { background-color: transparent; color: white; border-color: rgba(255,255,255,.3); }
        .hero-actions .btn-secondary:hover { background-color: rgba(255,255,255,.1); border-color: white; }
        .hero-install { margin-top: var(--space-8); }
        .hero-install-label { display: block; font-size: .875rem; opacity: .8; margin-bottom: var(--space-2); }
        .hero-install-cmd { display: flex; align-items: center; gap: var(--space-3); max-width: 100%; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.2); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); }
        .hero-install-cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9375rem; color: #fff; text-align: left; user-select: all; }
        .hero-install-prompt { opacity: .6; user-select: none; }
        .hero-install-copy { flex-shrink: 0; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.35); border-radius: var(--radius-md); padding: var(--space-1) var(--space-3); font-size: .8125rem; font-weight: 600; cursor: pointer; }
        .hero-install-copy:hover { background: rgba(255,255,255,.1); border-color: #fff; }
        .hero-image { width: 100%; height: auto; max-width: 500px; opacity: 0.9; filter: drop-shadow(0 10px 30px rgba(0,0,0,.3)); }
        .features { padding: var(--space-20) 0; background-color: var(--color-bg-secondary); }
        .section-header { text-align: center; margin-bottom: var(--space-16); }
        .section-header h2 { font-size: 2.5rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: var(--space-4); }
        .section-header p { font-size: 1.25rem; color: var(--color-text-secondary); }
        .features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-8); }
        .feature-item { background-color: var(--color-bg-primary); border: 1px solid var(--color-border-primary); border-radius: var(--radius-xl); padding: var(--space-8); transition: transform .3s ease, box-shadow .3s ease; }
        .feature-item:hover { transform: translateY(-5px); box-shadow: var(--shadow-xl); }
        .feature-number { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary)); color: white; border-radius: var(--radius-xl); font-weight: 700; font-size: 1.125rem; margin-bottom: var(--space-4); }
        .feature-item h3 { font-size: 1.5rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: var(--space-3); }
        .feature-item p { color: var(--color-text-secondary); line-height: 1.6; }
        @media (max-width: 768px) {
          .hero { padding: var(--space-16) 0; min-height: 70vh; }
          .hero-content { grid-template-columns: 1fr; gap: var(--space-12); text-align: center; }
          .hero-title { font-size: 2.5rem; }
          .hero-actions { justify-content: center; }
          .features-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  );
}
