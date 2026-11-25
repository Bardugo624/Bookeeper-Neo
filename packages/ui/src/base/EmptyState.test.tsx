import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

it('renders the title as a heading and the text', () => {
  render(<EmptyState icon="book" title="No books" text="Add your first one" />);
  expect(screen.getByRole('heading', { name: 'No books' })).toBeInTheDocument();
  expect(screen.getByText('Add your first one')).toBeInTheDocument();
});

it('renders no button without an action', () => {
  render(<EmptyState title="Nothing" />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('renders a clickable action', async () => {
  const onClick = vi.fn();
  render(<EmptyState title="Nothing" action={<Button onClick={onClick}>Create</Button>} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Create' }));
  expect(onClick).toHaveBeenCalledTimes(1);
});
