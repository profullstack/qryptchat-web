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
    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: 'ship it' } });
    textarea.setSelectionRange(4, 4);

    fireEvent.click(screen.getByTitle('Emoji'));
    fireEvent.change(await screen.findByLabelText('Search emoji'), { target: { value: 'rocket' } });
    fireEvent.click(await screen.findByRole('button', { name: 'rocket' }));

    await waitFor(() => expect(textarea.value).toBe('ship🚀 it'));
  });

  it('closes on Escape', async () => {
    render(<MessageInput conversationId="c1" />);
    fireEvent.click(screen.getByTitle('Emoji'));
    expect(await screen.findByRole('dialog', { name: 'Emoji' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Emoji' })).toBeNull());
  });
});
