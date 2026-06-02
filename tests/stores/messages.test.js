import { describe, it, expect, beforeEach } from 'vitest';
import { useMessagesStore, messages } from '../../src/lib/stores/messages.js';

describe('Messages Store (Zustand)', () => {
  beforeEach(() => {
    useMessagesStore.setState({ messages: [] });
  });

  it('adds info message', () => {
    const id = messages.info('Test info message');
    const state = useMessagesStore.getState();
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].type).toBe('info');
    expect(state.messages[0].message).toBe('Test info message');
    expect(id).toMatch(/^msg_/);
  });

  it('adds success message with auto-dismiss', () => {
    messages.success('Done!');
    const msg = useMessagesStore.getState().messages[0];
    expect(msg.type).toBe('success');
    expect(msg.autoDismiss).toBe(5000);
  });

  it('adds error message', () => {
    messages.error('Something broke');
    expect(useMessagesStore.getState().messages[0].type).toBe('error');
  });

  it('removes message by id', () => {
    const id = messages.info('Remove me');
    expect(useMessagesStore.getState().messages).toHaveLength(1);
    messages.remove(id);
    expect(useMessagesStore.getState().messages).toHaveLength(0);
  });

  it('clears all messages', () => {
    messages.info('A'); messages.info('B'); messages.info('C');
    expect(useMessagesStore.getState().messages).toHaveLength(3);
    messages.clear();
    expect(useMessagesStore.getState().messages).toHaveLength(0);
  });

  it('handles multiple messages', () => {
    messages.info('One'); messages.warning('Two'); messages.error('Three');
    const state = useMessagesStore.getState();
    expect(state.messages).toHaveLength(3);
    expect(state.messages.map((m) => m.type)).toEqual(['info', 'warning', 'error']);
  });
});
