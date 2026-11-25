import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Kbd } from './Kbd';

it('renders a kbd element', () => {
  render(<Kbd>Ctrl K</Kbd>);
  expect(screen.getByText('Ctrl K').tagName).toBe('KBD');
});
