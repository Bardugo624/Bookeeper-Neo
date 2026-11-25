import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ProgressRing } from './ProgressRing';

it.each([
  [0, '0'],
  [0.62, '62'],
  [1, '100'],
  [-1, '0'],
  [2, '100'],
  [NaN, '0'],
])('value %s gives aria-valuenow %s', (value, now) => {
  render(<ProgressRing value={value} label="Lettura" />);
  const bar = screen.getByRole('progressbar', { name: 'Lettura' });
  expect(bar).toHaveAttribute('aria-valuenow', now);
  expect(bar).toHaveAttribute('aria-valuemin', '0');
  expect(bar).toHaveAttribute('aria-valuemax', '100');
});

it('renders children in the center', () => {
  render(
    <ProgressRing value={0.5} label="L">
      50%
    </ProgressRing>,
  );
  expect(screen.getByText('50%')).toBeInTheDocument();
});

it('shows 0 as a child but not false, null or undefined', () => {
  const { container, rerender } = render(<ProgressRing value={0.5} label="L">{0}</ProgressRing>);
  expect(container.textContent).toBe('0');
  for (const child of [false, null, undefined]) {
    rerender(<ProgressRing value={0.5} label="L">{child}</ProgressRing>);
    expect(container.textContent).toBe('');
  }
});
