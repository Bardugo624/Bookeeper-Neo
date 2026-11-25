import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import './polyfills';
import { Menu } from './Menu';

function setup() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <Menu
      trigger={<button>Actions</button>}
      items={[
        { id: 'edit', label: 'Edit', icon: 'pencil', onSelect: onEdit },
        { type: 'separator', id: 's' },
        { id: 'delete', label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
      ]}
    />,
  );
  return { onEdit, onDelete };
}

it('opens with Enter, moves focus with arrows and selects with Enter once', async () => {
  const user = userEvent.setup();
  const { onEdit, onDelete } = setup();
  screen.getByRole('button', { name: 'Actions' }).focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('menu')).toBeInTheDocument();
  expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  // Opening with the keyboard focuses the first item.
  expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
  await user.keyboard('{ArrowDown}');
  expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onEdit).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
