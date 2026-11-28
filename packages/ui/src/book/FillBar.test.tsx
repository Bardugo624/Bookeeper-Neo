import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { FillBar } from './FillBar';

it.each([
  [0.74, 'ok'],
  [0.75, 'warn'],
  [0.95, 'danger'],
])('auto tone at %s is %s', (value, tone) => {
  render(<FillBar value={value} label="Spazio" />);
  expect(screen.getByRole('progressbar', { name: 'Spazio' })).toHaveAttribute('data-tone', tone);
});

it('scales the indicator to the value', () => {
  const { container } = render(<FillBar value={0.4} label="L" />);
  expect((container.querySelector('[role=progressbar] > div') as HTMLElement).style.transform).toBe('scaleX(0.4)');
});

it('honours an explicit tone and exposes ARIA values', () => {
  render(<FillBar value={0.5} tone="danger" label="L" />);
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('data-tone', 'danger');
  expect(bar).toHaveAttribute('aria-valuenow', '50');
});

it('exposes aria-valuetext only when given', () => {
  const { rerender } = render(<FillBar value={0.5} label="L" valueText="Copio i file, 50%" />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Copio i file, 50%');
  rerender(<FillBar value={0.5} label="L" />);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuetext');
});
