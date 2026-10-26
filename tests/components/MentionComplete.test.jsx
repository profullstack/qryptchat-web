import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({ state: {} }));
vi.mock('@/lib/stores/chat.js', () => ({
  useChatStore: Object.assign((select) => select(store.state), { getState: () => store.state }),
}));
vi.mock('@/lib/stores/auth.js', () => ({ useAuthStore: (select) => select({ user: { id: 'me' } }) }));

import MessageInput from '../../src/lib/components/chat/MessageInput.jsx';

const participants = [
  { user_id: 'me', user: { username: 'chovy' } },
  { user_id: 'a', user: { username: 'alice', display_name: 'Alice Smith' } },
  { user_id: 'b', user: { username: 'alina' } },
  { user_id: 'r', user: { username: 'riotcoder', account_type: 'agent' } },
];

beforeEach(() => {
  // The composer loads the chat's members itself (the store's list can be empty).
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ participants }) }));
  store.state = {
    conversations: [],
    sendMessage: vi.fn(async () => ({ success: true })),
    setTyping: vi.fn(),
    stopTyping: vi.fn(),
    loadMessages: vi.fn(),
    replyingTo: null,
    clearReplyingTo: vi.fn(),
  };
});

/** Type into the editor with the caret at the end, as a person would. */
function type(editor, text) {
  editor.focus();
  editor.textContent = text;
  const range = document.createRange();
  range.setStart(editor.firstChild, text.length);
  range.collapse(true);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  fireEvent.input(editor);
}

const text = (editor) => editor.textContent;

describe('@mention completion in the web composer', () => {
  it('lists matches for @partial and Tab picks the highlighted one', async () => {
    render(<MessageInput conversationId="c1" />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    type(editor, 'hey @al');
    const list = await screen.findByRole('listbox', { name: 'Mention someone' });
    expect([...list.querySelectorAll('[role=option] .mention-username')].map((n) => n.textContent)).toEqual(['@alice', '@alina']);
    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'Tab' });
    await waitFor(() => expect(text(editor)).toBe('hey @alina '));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a bare @ offers everyone but you, Enter picks instead of sending', async () => {
    render(<MessageInput conversationId="c1" />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    type(editor, '@');
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.querySelector('.mention-username').textContent)).toEqual(['@alice', '@alina', '@riotcoder']);
    fireEvent.keyDown(editor, { key: 'Enter' });
    await waitFor(() => expect(text(editor)).toBe('@alice '));
    expect(store.state.sendMessage).not.toHaveBeenCalled();
  });

  it('Tab again cycles to the next match, IRC-style', async () => {
    render(<MessageInput conversationId="c1" />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    type(editor, '@al');
    await screen.findByRole('listbox');
    fireEvent.keyDown(editor, { key: 'Tab' });
    await waitFor(() => expect(text(editor)).toBe('@alice '));
    fireEvent.keyDown(editor, { key: 'Tab' });
    await waitFor(() => expect(text(editor)).toBe('@alina '));
  });

  it('a tap picks (phones), Esc closes the list', async () => {
    render(<MessageInput conversationId="c1" />);
    const editor = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    type(editor, 'ping @ri');
    fireEvent.mouseDown(await screen.findByText('@riotcoder'));
    await waitFor(() => expect(text(editor)).toBe('ping @riotcoder '));
    type(editor, 'ping @a');
    await screen.findByRole('listbox');
    fireEvent.keyDown(editor, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });
});
