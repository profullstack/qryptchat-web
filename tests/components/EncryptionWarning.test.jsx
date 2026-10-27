import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ hasKeys: true, status: 'match', sync: null, push: null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: m.push }) }));
vi.mock('@/lib/crypto/key-manager.js', () => ({
  keyManager: { initialize: async () => {}, hasUserKeys: async () => m.hasKeys, generateUserKeys: async () => {} },
}));
vi.mock('@/lib/crypto/key-sync-service.js', () => ({
  keySyncService: { publishedKeyStatus: async () => m.status, forceSyncPublicKey: (...a) => m.sync(...a) },
}));

import EncryptionWarning from '../../src/lib/components/EncryptionWarning.jsx';

beforeEach(() => {
  m.hasKeys = true;
  m.status = 'match';
  m.sync = vi.fn(async () => ({ success: true }));
  m.push = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('EncryptionWarning', () => {
  it('stays hidden when this device holds the account keys', async () => {
    const { container } = render(<EncryptionWarning />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('says so when this device holds different keys, and restoring is the first choice', async () => {
    m.status = 'differs';
    render(<EncryptionWarning />);
    expect(await screen.findByText('This device has different keys from your account')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Restore my keys'));
    expect(m.push).toHaveBeenCalledWith('/settings');
    expect(m.sync).not.toHaveBeenCalled();
  });

  it("publishes this device's key only after a confirm", async () => {
    m.status = 'differs';
    render(<EncryptionWarning />);
    fireEvent.click(await screen.findByText("Use this device's keys"));
    await waitFor(() => expect(m.sync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('This device has different keys from your account')).toBeNull());
  });

  it('generating new keys publishes them explicitly', async () => {
    m.hasKeys = false;
    render(<EncryptionWarning />);
    fireEvent.click(await screen.findByText('Generate new keys'));
    await waitFor(() => expect(m.sync).toHaveBeenCalledTimes(1));
  });
});
