import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Divider } from './Divider';

it('is a separator with orientation', () => {
  const { rerender } = render(<Divider />);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal');
  rerender(<Divider orientation="vertical" />);
  expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
});
