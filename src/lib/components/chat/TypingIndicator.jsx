'use client';

export default function TypingIndicator({ typingUsers = [] }) {
  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.display_name || u.username || 'Someone');
  const text = names.length === 1
    ? `${names[0]} is typing...`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing...`
    : `${names.slice(0, 2).join(', ')} and others are typing...`;

  return (
    <div className="typing-indicator">
      <div className="typing-dots">
        <span /><span /><span />
      </div>
      <span className="typing-text">{text}</span>
      <style>{`
        .typing-indicator { display: flex; align-items: center; gap: .5rem; padding: .5rem 1rem; color: var(--color-text-secondary); font-size: .875rem; font-style: italic; }
        .typing-dots { display: flex; gap: 3px; }
        .typing-dots span { width: 6px; height: 6px; background: var(--color-text-secondary); border-radius: 50%; animation: bounce 1.2s infinite; }
        .typing-dots span:nth-child(2) { animation-delay: .2s; }
        .typing-dots span:nth-child(3) { animation-delay: .4s; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
      `}</style>
    </div>
  );
}
