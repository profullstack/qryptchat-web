import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Message from '../../src/lib/components/Message.jsx';

describe('Message component', () => {
  it('renders info message', () => {
    render(<Message type="info" message="Info text" />);
    expect(screen.getByText('Info text')).toBeInTheDocument();
  });

  it('renders with optional title', () => {
    render(<Message type="success" message="Body" title="Header" />);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it('calls onDismiss when close clicked', () => {
    const dismiss = vi.fn();
    render(<Message type="error" message="Error" dismissible onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button'));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('does not show dismiss button when dismissible=false', () => {
    render(<Message type="warning" message="Warning" dismissible={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
