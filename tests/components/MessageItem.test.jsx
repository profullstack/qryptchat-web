import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/stores/auth.js', () => ({ useAuthStore: (select) => select({ user: { id: 'me' } }) }));
vi.mock('../../src/lib/components/chat/MessageAttachments.jsx', () => ({ default: () => null }));

import MessageItem from '../../src/lib/components/chat/MessageItem.jsx';

const base = {
  id: 'm2',
  sender_id: 'bob',
  sender: { display_name: 'Bob' },
  content: 'yes, shipping now',
  message_type: 'text',
  created_at: '2026-10-06T10:00:00Z',
  reactions: [
    { emoji: '❤️', count: 2, mine: true, names: ['You', 'Alice'] },
    { emoji: '👍', count: 1, mine: false, names: ['Alice'] },
  ],
  replyTo: { id: 'm1', name: 'You', snippet: 'are we shipping?', missing: false },
};

describe('a message with replies and reactions', () => {
  it('quotes the message it replies to, and jumps there on click', () => {
    const onJumpTo = vi.fn();
    render(<MessageItem message={base} onJumpTo={onJumpTo} />);
    fireEvent.click(screen.getByTitle('Show the original message'));
    expect(onJumpTo).toHaveBeenCalledWith('m1');
    expect(screen.getByText('are we shipping?')).toBeInTheDocument();
  });

  it('shows reaction chips with OpenEmoji art; tapping mine removes it, tapping another replaces', () => {
    const onReact = vi.fn();
    render(<MessageItem message={base} onReact={onReact} />);
    const heart = screen.getByRole('button', { name: '❤️ 2, including you' });
    expect(heart.querySelector('img.openemoji').getAttribute('src')).toBe('/openemoji/64/2764-fe0f.webp');
    expect(heart.title).toBe('You, Alice');
    fireEvent.click(heart);
    expect(onReact).toHaveBeenLastCalledWith('❤️', true);
    fireEvent.click(screen.getByRole('button', { name: '👍 1' }));
    expect(onReact).toHaveBeenLastCalledWith('👍', false);
  });

  it('offers reply and quick reactions', () => {
    const onReply = vi.fn();
    const onReact = vi.fn();
    render(<MessageItem message={{ ...base, reactions: [] }} onReply={onReply} onReact={onReact} />);
    // Hidden until hover; a tap on the bubble opens it (touch screens).
    expect(screen.queryByRole('button', { name: 'Reply' })).toBeNull();
    fireEvent.click(screen.getByText('yes, shipping now'));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(onReply).toHaveBeenCalled();
    fireEvent.click(screen.getByText('yes, shipping now'));
    fireEvent.click(screen.getByRole('button', { name: 'React 😂' }));
    expect(onReact).toHaveBeenLastCalledWith('😂', false);
  });

  it('never renders the quoted snippet as HTML', () => {
    render(<MessageItem message={{ ...base, replyTo: { id: 'm1', name: 'Eve', snippet: '<img src=x onerror=alert(1)>', missing: false } }} />);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });
});
