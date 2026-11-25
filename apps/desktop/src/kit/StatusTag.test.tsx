import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTag } from './StatusTag';

type S = 'open' | 'closed';
const labels: Record<S, string> = { open: 'Aperto', closed: 'Chiuso' };

describe('StatusTag', () => {
  it('shows the label of the status', () => {
    render(<StatusTag<S> status="open" tones={{ open: 'ok' }} labels={labels} />);
    expect(screen.getByText('Aperto')).toBeInTheDocument();
  });

  it('accepts a status with no tone', () => {
    render(<StatusTag<S> status="closed" tones={{ open: 'ok' }} labels={labels} />);
    expect(screen.getByText('Chiuso')).toBeInTheDocument();
  });
});
