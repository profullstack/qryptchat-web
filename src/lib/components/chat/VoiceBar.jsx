'use client';

import { Icon } from './EmojiPicker.jsx';

const STATUS = {
  starting: 'Starting…',
  listening: 'Listening…',
  waiting: 'Sent. Waiting for a reply…',
  speaking: 'Reading the reply…',
  paused: 'Paused. Tap the mic to talk.',
};

const STAGE = {
  hearing: 'Hearing you…',
  transcribing: 'Transcribing…',
};

const PRIVACY = {
  'on-device': 'Speech is recognised on this device.',
  browser: "Speech is recognised by your browser's speech service. Messages are still end-to-end encrypted.",
  server: 'Speech is transcribed by qrypt.chat (Cloudflare Workers AI) and not stored. Messages are still end-to-end encrypted.',
};

/** The strip above the composer while voice mode is on. */
export default function VoiceBar({ voice, agents = [] }) {
  const { phase, stage, transcript, engine, muted, error } = voice;
  // An error stays on screen even when voice mode could not start at all.
  if (phase === 'off' && !error) return null;
  const names = agents.map((a) => a.display_name || a.username).filter(Boolean);

  return (
    <div className={`voice-bar voice-${phase}`} role="status" aria-live="polite">
      <div className="voice-main">
        <span className="voice-dot" aria-hidden="true" />
        <div className="voice-text">
          <div className="voice-status">
            {(phase === 'listening' && STAGE[stage]) || STATUS[phase] || 'Voice mode'}
            {names.length > 0 && <span className="voice-who"> · with {names.join(', ')}</span>}
          </div>
          {transcript && <div className="voice-transcript">“{transcript}”</div>}
          {error && <div className="voice-error">{error}</div>}
          <div className="voice-privacy">
            {PRIVACY[engine] || PRIVACY.browser}
            {' '}Say “stop” to end.
          </div>
        </div>
      </div>
      <div className="voice-actions">
        {phase === 'listening' && transcript && (
          <button type="button" onClick={voice.done} title="Send now">Send</button>
        )}
        {phase === 'speaking' && (
          <button type="button" onClick={voice.skip} title="Skip this reply">Skip</button>
        )}
        <button type="button" onClick={voice.toggleMute} title={muted ? 'Read replies aloud' : "Don't read replies aloud"} aria-pressed={muted}>
          <Icon name={muted ? 'volume-off' : 'volume'} size={16} />
        </button>
        <button type="button" className="voice-stop" onClick={voice.stop} title="End voice mode">
          <Icon name="stop" size={16} />
        </button>
      </div>

      <style>{`
        .voice-bar { display: flex; align-items: flex-start; gap: .75rem; margin-bottom: .5rem; padding: .5rem .75rem; border: 1px solid var(--color-border-primary); border-left: 3px solid var(--color-brand-primary); border-radius: .5rem; background: var(--color-bg-secondary); font-size: .8125rem; color: var(--color-text-secondary); }
        .voice-main { flex: 1; min-width: 0; display: flex; gap: .6rem; align-items: flex-start; }
        .voice-dot { flex-shrink: 0; width: 10px; height: 10px; margin-top: .3rem; border-radius: 50%; background: var(--color-text-muted); }
        .voice-listening .voice-dot { background: var(--color-error, #ef4444); animation: voice-pulse 1.2s ease-in-out infinite; }
        .voice-speaking .voice-dot { background: var(--color-brand-primary); animation: voice-pulse .8s ease-in-out infinite; }
        .voice-waiting .voice-dot { background: var(--color-brand-primary); opacity: .6; }
        .voice-text { min-width: 0; }
        .voice-status { font-weight: 600; color: var(--color-text-primary); }
        .voice-who { font-weight: 400; color: var(--color-text-secondary); }
        .voice-transcript { margin-top: .15rem; color: var(--color-text-primary); overflow-wrap: anywhere; }
        .voice-error { margin-top: .15rem; color: var(--color-error); }
        .voice-privacy { margin-top: .15rem; font-size: .75rem; opacity: .7; }
        .voice-actions { display: flex; gap: .35rem; flex-shrink: 0; }
        .voice-actions button { display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 .6rem; border: 1px solid var(--color-border-primary); border-radius: 1rem; background: var(--color-bg-primary); color: var(--color-text-primary); cursor: pointer; font-size: .8125rem; }
        .voice-actions button:hover { background: var(--color-bg-tertiary); }
        .voice-actions button[aria-pressed="true"] { color: var(--color-text-muted); }
        .voice-actions .voice-stop:hover { color: var(--color-error); }
        @keyframes voice-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .6; } }
        @media (prefers-reduced-motion: reduce) { .voice-dot { animation: none !important; } }
        @media (max-width: 480px) { .voice-bar { flex-direction: column; } .voice-actions { align-self: flex-end; } }
      `}</style>
    </div>
  );
}
