import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Toast from '../../src/lib/components/Toast.jsx';
import { useMessagesStore } from '../../src/lib/stores/messages.js';

describe('Toast component', () => {
  it('renders success toast', () => {
    render(<Toast id="1" type="success" message="It worked!" />);
    expect(screen.getByText('It worked!')).toBeInTheDocument();
  });

  it('renders error toast', () => {
    render(<Toast id="2" type="error" message="Something failed" />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(<Toast id="3" type="info" message="Body" title="Title here" />);
    expect(screen.getByText('Title here')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('calls remove when close button clicked', () => {
    const remove = vi.spyOn(useMessagesStore.getState(), 'remove');
    useMessagesStore.setState({ remove });
    render(<Toast id="test-id" type="info" message="Close me" dismissible={true} />);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(remove).toHaveBeenCalledWith('test-id');
  });

  it('hides dismiss button when not dismissible', () => {
    render(<Toast id="4" type="warning" message="Not dismissible" dismissible={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
