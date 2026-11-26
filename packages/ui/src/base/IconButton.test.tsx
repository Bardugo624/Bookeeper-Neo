import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

it('uses label as the accessible name and is clickable', async () => {
  const onClick = vi.fn();
  render(<IconButton icon="close" label="Close" onClick={onClick} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

it('requires a label', () => {
  // @ts-expect-error label is required
  render(<IconButton icon="close" />);
});

it('adds the danger tone class without changing the accessible name', () => {
  render(<IconButton icon="close" label="Delete" tone="danger" />);
  const btn = screen.getByRole('button', { name: 'Delete' });
  expect(btn.className).toMatch(/toneDanger/);
  expect(btn).toHaveAttribute('aria-label', 'Delete');
});
