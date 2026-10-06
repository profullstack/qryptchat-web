import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/stores/chat.js', () => ({
  useChatStore: (select) =>
    select({ sendMessage: vi.fn(), setTyping: vi.fn(), stopTyping: vi.fn(), loadMessages: vi.fn() }),
}));
vi.mock('@/lib/stores/auth.js', () => ({ useAuthStore: (select) => select({ user: { id: 'u1' } }) }));

import MessageInput from '../../src/lib/components/chat/MessageInput.jsx';

const index = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'public', 'openemoji', 'index.json'), 'utf8'));

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => index }));
});

describe('emoji picker in the composer', () => {
  it('opens from the emoji button and inserts at the caret', async () => {
    render(<MessageInput conversationId="c1" />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    editor.textContent = 'ship it';
    fireEvent.input(editor);
    const range = document.createRange();
    range.setStart(editor.firstChild, 4);
    range.collapse(true);
    document.getSelection().removeAllRanges();
    document.getSelection().addRange(range);
    // Opening the picker moves focus to its search box: the editor blurs and remembers the caret.
    fireEvent.blur(editor);

    fireEvent.click(screen.getByTitle('Emoji'));
    fireEvent.change(await screen.findByLabelText('Search emoji'), { target: { value: 'rocket' } });
    fireEvent.click(await screen.findByRole('button', { name: 'rocket' }));

    // Shown as our artwork, kept as plain text.
    await waitFor(() => expect(editor.querySelector('img.openemoji')?.alt).toBe('🚀'));
    expect(editor.querySelector('img.openemoji').getAttribute('src')).toBe('/openemoji/64/1f680.webp');
    expect([...editor.childNodes].map((n) => n.nodeValue ?? n.alt).join('')).toBe('ship🚀 it');
  });

  it('closes on Escape', async () => {
    render(<MessageInput conversationId="c1" />);
    fireEvent.click(screen.getByTitle('Emoji'));
    expect(await screen.findByRole('dialog', { name: 'Emoji' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Emoji' })).toBeNull());
  });
});
