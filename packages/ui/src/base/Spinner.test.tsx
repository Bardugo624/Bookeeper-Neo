import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Spinner } from './Spinner';

it('has an accessible name', () => {
  render(<Spinner label="Loading" />);
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
});
