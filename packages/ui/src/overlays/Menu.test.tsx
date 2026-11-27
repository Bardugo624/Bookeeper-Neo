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

it('puts dangerous items last after a divider, in arrival order', async () => {
  const user = userEvent.setup();
  const noop = () => {};
  render(
    <Menu
      trigger={<button>Actions</button>}
      items={[
        { id: 'd1', label: 'Delete one', danger: true, onSelect: noop },
        { id: 'edit', label: 'Edit', onSelect: noop },
        { id: 'd2', label: 'Delete two', danger: true, onSelect: noop },
        { id: 'share', label: 'Share', onSelect: noop },
      ]}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  const menu = await screen.findByRole('menu');
  const children = [...menu.children];
  expect(children.map((e) => e.textContent || e.getAttribute('role'))).toEqual(['Edit', 'Share', 'separator', 'Delete one', 'Delete two']);
});

it('adds no divider when there are no dangerous items', async () => {
  const user = userEvent.setup();
  render(<Menu trigger={<button>Actions</button>} items={[{ id: 'a', label: 'A', onSelect: () => {} }, { id: 'b', label: 'B', onSelect: () => {} }]} />);
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  await screen.findByRole('menu');
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();
});

async function menuShape(items: Parameters<typeof Menu>[0]['items']) {
  const user = userEvent.setup();
  render(<Menu trigger={<button>Actions</button>} items={items} />);
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  const menu = await screen.findByRole('menu');
  return [...menu.children].map((e) => e.textContent || e.getAttribute('role'));
}

const item = (id: string, danger = false) => ({ id, label: id, danger, onSelect: () => {} });
const sep = (id: string) => ({ type: 'separator' as const, id });

it('has no divider when every item is dangerous', async () => {
  expect(await menuShape([item('A', true), item('B', true)])).toEqual(['A', 'B']);
});

it('does not leave two dividers in a row around a dangerous item', async () => {
  expect(await menuShape([item('Edit'), sep('s1'), item('Delete', true), sep('s2'), item('Share')])).toEqual(['Edit', 'separator', 'Share', 'separator', 'Delete']);
});

it('drops leading, trailing and doubled separators', async () => {
  expect(await menuShape([sep('a'), item('X'), sep('b'), sep('c'), item('Y'), sep('d')])).toEqual(['X', 'separator', 'Y']);
});
