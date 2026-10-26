'use client';

/**
 * Call ordinary phones (US and Canada) from qrypt.chat, like Skype used to.
 * 10 free minutes a day for signed-in accounts. The browser's phone line only
 * receives calls: the server rings it, then connects it to the number with a
 * hard time limit (src/lib/server/phone.js).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth.js';
import { blockedReason, formatNumber, normalizeNumber } from '@/lib/phone/rules.js';
import { setBusy } from '@/lib/app-update.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export default function PhonePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [info, setInfo] = useState(null);
  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | starting | ringing | connected | ended
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [limit, setLimit] = useState(0);
  const [showKeys, setShowKeys] = useState(false);
  const clientRef = useRef(null);
  const callRef = useRef(null);
  const callIdRef = useRef(null);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!user) router.replace('/auth');
  }, [user]);

  async function refresh() {
    const res = await fetch('/api/phone').catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) setInfo(data);
    else setError(data.error || 'Phone calls are unavailable right now.');
  }
  useEffect(() => {
    if (user) refresh();
  }, [user]);

  // The call clock, and no auto-reload after a deploy while on a call.
  useEffect(() => {
    setBusy('phone', phase === 'starting' || phase === 'ringing' || phase === 'connected');
    if (phase !== 'connected') return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => () => { setBusy('phone', false); clientRef.current?.disconnect?.(); }, []);

  const e164 = normalizeNumber(number);
  const why = number.trim() ? blockedReason(e164) : '';

  function finish(msg) {
    callRef.current = null;
    setPhase('ended');
    if (msg) setError(msg);
    try { clientRef.current?.disconnect(); } catch {}
    clientRef.current = null;
    setTimeout(() => { setPhase('idle'); refresh(); }, 1500);
  }

  async function call() {
    if (!e164 || why || phase !== 'idle') return;
    setError('');
    setMuted(false);
    setElapsed(0);
    setPhase('starting');
    try {
      // 1. Log the browser's phone line in.
      const tok = await fetch('/api/phone/token', { method: 'POST' });
      const t = await tok.json().catch(() => ({}));
      if (!tok.ok) throw new Error(t.error || 'Could not start the phone line');
      const { TelnyxRTC } = await import('@telnyx/webrtc');
      const client = new TelnyxRTC({ login_token: t.token });
      clientRef.current = client;
      client.remoteElement = 'phone-remote-audio';
      client.on('telnyx.error', () => finish('The phone line dropped.'));
      client.on('telnyx.notification', (n) => {
        if (n.type !== 'callUpdate') return;
        const c = n.call;
        // 2. The server rings this line: answer, and the number is dialled.
        if (c.state === 'ringing' && c.direction === 'inbound') {
          callRef.current = c;
          c.answer();
        }
        if (c.state === 'active') {
          startedRef.current = Date.now();
          setPhase('connected');
        }
        if (c.state === 'hangup' || c.state === 'destroy') finish();
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The phone line did not connect')), 15000);
        client.on('telnyx.ready', () => { clearTimeout(timer); resolve(); });
        client.connect();
      });
      // 3. Ask the server to place the call.
      const res = await fetch('/api/phone/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: e164 }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not place the call');
      callIdRef.current = data.callId;
      setLimit(data.limitSeconds);
      setPhase('ringing');
    } catch (e) {
      finish(e.message);
    }
  }

  function hangup() {
    try { callRef.current?.hangup(); } catch {}
    if (callIdRef.current) fetch('/api/phone/hangup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: callIdRef.current }) }).catch(() => {});
    finish();
  }

  function toggleMute() {
    const c = callRef.current;
    if (!c) return;
    if (muted) c.unmuteAudio(); else c.muteAudio();
    setMuted(!muted);
  }

  function press(k) {
    if (phase === 'connected') callRef.current?.dtmf(k);
    else if (phase === 'idle') setNumber((n) => (n + k).slice(0, 20));
  }

  if (!user) return null;
  const onCall = phase === 'starting' || phase === 'ringing' || phase === 'connected';
  const free = info ? Math.floor(info.freeSecondsLeft / 60) : null;

  return (
    <div className="phone-page">
      <audio id="phone-remote-audio" autoPlay />
      <div className="phone-card">
        <h1>Phone</h1>
        <p className="phone-sub">
          Call any US or Canadian phone.{' '}
          {info?.operator ? 'Unlimited for you.' : info?.anonymous ? 'Sign in with a phone number, passkey or CoinPay to get 10 free minutes a day.' : `${free ?? '…'} of ${info ? info.freeSecondsPerDay / 60 : 10} free minutes left today.`}
        </p>

        {!onCall ? (
          <>
            <input
              className="phone-number"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && call()}
              aria-label="Phone number"
            />
            {why && <p className="phone-error">{why}</p>}
            <div className="phone-keys">
              {KEYS.map((k) => <button key={k} type="button" onClick={() => press(k)}>{k}</button>)}
            </div>
            <div className="phone-actions">
              <button type="button" className="phone-call" onClick={call} disabled={!e164 || !!why || phase !== 'idle'}>📞 Call {e164 ? formatNumber(e164) : ''}</button>
              {number && <button type="button" className="phone-clear" onClick={() => setNumber((n) => n.slice(0, -1))} aria-label="Delete">⌫</button>}
            </div>
          </>
        ) : (
          <div className="phone-live">
            <div className="phone-live-number">{formatNumber(e164)}</div>
            <div className="phone-live-state">
              {phase === 'starting' && 'Starting…'}
              {phase === 'ringing' && 'Calling…'}
              {phase === 'connected' && <>{mmss(elapsed)} <span className="phone-left">· {mmss(limit - elapsed)} left</span></>}
            </div>
            {showKeys && phase === 'connected' && (
              <div className="phone-keys small">
                {KEYS.map((k) => <button key={k} type="button" onClick={() => press(k)}>{k}</button>)}
              </div>
            )}
            <div className="phone-actions">
              <button type="button" onClick={toggleMute} aria-pressed={muted} disabled={phase !== 'connected'}>{muted ? 'Unmute' : 'Mute'}</button>
              <button type="button" onClick={() => setShowKeys((v) => !v)} disabled={phase !== 'connected'}>Keypad</button>
              <button type="button" className="phone-hangup" onClick={hangup}>Hang up</button>
            </div>
          </div>
        )}
        {phase === 'ended' && <p className="phone-sub">Call ended.</p>}
        {error && <p className="phone-error">{error}</p>}

        <p className="phone-note">
          Calls to phones go over the public phone network, so unlike calls between qrypt.chat users they are not end-to-end
          encrypted. The person you call sees {info?.callerId ? formatNumber(info.callerId) : 'our number'}. Emergency (911) and premium-rate numbers can't be called.
        </p>

        {info?.calls?.length > 0 && (
          <div className="phone-recent">
            <h2>Recent calls</h2>
            <ul>
              {info.calls.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => !onCall && setNumber(c.to_number)}>{formatNumber(c.to_number)}</button>
                  <span>{c.billed_seconds ? mmss(c.billed_seconds) : c.status === 'ended' || c.status === 'failed' ? 'not connected' : c.status}</span>
                  <span>{new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <style>{`
        .phone-page { display: flex; justify-content: center; padding: 2rem 1rem; }
        .phone-card { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 1rem; }
        .phone-card h1 { font-size: 1.75rem; font-weight: 700; color: var(--color-text-primary); }
        .phone-sub { color: var(--color-text-secondary); line-height: 1.5; }
        .phone-number { width: 100%; font-size: 1.75rem; text-align: center; padding: .75rem; border: 1px solid var(--color-border-primary); border-radius: .75rem; background: var(--color-bg-secondary); color: var(--color-text-primary); letter-spacing: .03em; }
        .phone-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: .6rem; }
        .phone-keys button { aspect-ratio: 1.6; font-size: 1.5rem; border-radius: 1rem; border: 1px solid var(--color-border-primary); background: var(--color-bg-secondary); color: var(--color-text-primary); cursor: pointer; }
        .phone-keys.small button { aspect-ratio: 2.2; font-size: 1.2rem; }
        .phone-keys button:active { background: var(--color-bg-tertiary); }
        .phone-actions { display: flex; gap: .6rem; }
        .phone-actions button { flex: 1; padding: .85rem; border-radius: 999px; border: 1px solid var(--color-border-primary); background: var(--color-bg-secondary); color: var(--color-text-primary); font-weight: 600; cursor: pointer; }
        .phone-actions button:disabled { opacity: .5; cursor: not-allowed; }
        .phone-actions .phone-call { background: var(--color-success, #16a34a); border-color: transparent; color: #fff; font-size: 1.05rem; }
        .phone-actions .phone-clear { flex: 0 0 3.5rem; }
        .phone-actions .phone-hangup { background: var(--color-error, #dc2626); border-color: transparent; color: #fff; }
        .phone-live { display: flex; flex-direction: column; gap: 1rem; align-items: stretch; text-align: center; padding: 1.5rem 0; }
        .phone-live-number { font-size: 1.75rem; font-weight: 700; color: var(--color-text-primary); }
        .phone-live-state { font-size: 1.2rem; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
        .phone-left { font-size: .95rem; opacity: .75; }
        .phone-error { color: var(--color-error); }
        .phone-note { font-size: .8125rem; color: var(--color-text-muted); line-height: 1.5; }
        .phone-recent h2 { font-size: 1rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: .5rem; }
        .phone-recent ul { list-style: none; display: flex; flex-direction: column; gap: .35rem; padding: 0; }
        .phone-recent li { display: grid; grid-template-columns: 1fr auto auto; gap: .75rem; align-items: center; font-size: .875rem; color: var(--color-text-secondary); }
        .phone-recent li button { text-align: left; background: none; border: none; color: var(--color-text-primary); cursor: pointer; padding: 0; font: inherit; }
      `}</style>
    </div>
  );
}
