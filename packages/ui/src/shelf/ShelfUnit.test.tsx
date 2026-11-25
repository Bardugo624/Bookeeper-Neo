import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../overlays/polyfills';
import { ShelfUnit, SHELF_COLORS, spineHeight, spineWidth, type ShelfAnnounce, type ShelfRow } from './index';

const rows: ShelfRow[] = [
  {
    id: 'r1',
    label: 'Ripiano 1',
    capacity: 10,
    books: [
      { id: 'a', title: 'Dune', author: 'Herbert', pages: 412 },
      { id: 'b', title: 'Emma', author: 'Austen', pages: 300 },
      { id: 'c', title: 'Ubik', pages: 200 },
    ],
  },
  { id: 'r2', label: 'Ripiano 2', capacity: 2, books: [{ id: 'd', title: 'Solaris', author: 'Lem' }, { id: 'e', title: 'Kim' }] },
  { id: 'r3', label: 'Ripiano 3', books: [] },
];

const announce: ShelfAnnounce = {
  pick: (b) => `preso ${b.title}`,
  move: (b, r, i) => `${b.title} su ${r.label} posto ${i}`,
  drop: (b, r, i) => `posato ${b.title} su ${r.label} posto ${i}`,
  cancel: (b) => `annullato ${b.title}`,
};

const spineLabel = (b: { title: string; author?: string; pages?: number }) => ({
  title: b.title,
  detail: `${b.author ?? '-'} · ${b.pages ?? 0} pagine`,
});

function setup(extra: Partial<React.ComponentProps<typeof ShelfUnit>> = {}) {
  const onSlotDrop = vi.fn();
  const utils = render(
    <ShelfUnit color={SHELF_COLORS[0]!} rows={rows} spineLabel={spineLabel} announce={announce} onSlotDrop={onSlotDrop} {...extra} />,
  );
  return { onSlotDrop, ...utils };
}

class FakeDataTransfer {
  data = new Map<string, string>();
  get types() {
    return [...this.data.keys()];
  }
  effectAllowed = 'all';
  dropEffect = 'none';
  setData(t: string, v: string) {
    this.data.set(t, v);
  }
  getData(t: string) {
    return this.data.get(t) ?? '';
  }
}

/** Gives each spine of a row a 20px box so that drop positions can be computed in jsdom. */
function layOut(rowName: string) {
  const row = screen.getByRole('group', { name: rowName });
  row.querySelectorAll<HTMLElement>('[data-spine-id]').forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 20, width: 20, right: i * 20 + 20, top: 0, bottom: 0, height: 0, x: i * 20, y: 0, toJSON() {} });
  });
  return row.firstElementChild as HTMLElement;
}

function dragEvent(type: 'dragOver' | 'drop', el: Element, dt: FakeDataTransfer, clientX: number) {
  const event = createEvent[type](el, { dataTransfer: dt });
  Object.defineProperty(event, 'clientX', { value: clientX });
  fireEvent(el, event);
}

describe('render', () => {
  it('draws a named button per book, rows in order', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Dune, Herbert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ubik' })).toBeInTheDocument();
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Ripiano 1', 'Ripiano 2', 'Ripiano 3']);
  });

  it('sizes spines from the page count', () => {
    setup();
    const dune = screen.getByRole('button', { name: 'Dune, Herbert' });
    expect(dune.style.width).toBe(`${spineWidth(412)}px`);
    expect(dune.style.height).toBe(`${spineHeight('a')}%`);
    expect(screen.getByRole('button', { name: 'Kim' }).style.width).toBe('20px');
  });

  it('draws empty places up to the capacity, at most 6, none when full', () => {
    const { container } = setup();
    const empties = (name: string) => within(screen.getByRole('group', { name })).queryAllByText('', { selector: 'span[aria-hidden]' }).length;
    expect(empties('Ripiano 1')).toBe(6);
    expect(empties('Ripiano 2')).toBe(0);
    expect(empties('Ripiano 3')).toBe(0);
    expect(container).toBeTruthy();
  });

  it('shows the label from spineLabel on focus', async () => {
    setup();
    await userEvent.setup().tab();
    expect(screen.getByRole('button', { name: 'Dune, Herbert' })).toHaveFocus();
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Dune');
    expect(tip).toHaveTextContent('Herbert · 412 pagine');
  });

  it('marks the selected spine and reports clicks and Enter', async () => {
    const onSpineClick = vi.fn();
    setup({ selectedId: 'b', onSpineClick });
    expect(screen.getByRole('button', { name: 'Emma, Austen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ubik' })).toHaveAttribute('aria-pressed', 'false');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Ubik' }));
    expect(onSpineClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    onSpineClick.mockClear();
    screen.getByRole('button', { name: 'Dune, Herbert' }).focus();
    await user.keyboard('{Enter}');
    expect(onSpineClick).toHaveBeenCalledTimes(1);
    expect(onSpineClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });
});

describe('drag and drop', () => {
  const drag = (clientX: number, rowName = 'Ripiano 1', dt = new FakeDataTransfer()) => {
    const { onSlotDrop } = setup();
    const strip = layOut(rowName);
    if (!dt.types.length) dt.setData('application/x-bookeeper-book', 'd');
    dragEvent('dragOver', strip, dt, clientX);
    dragEvent('drop', strip, dt, clientX);
    return onSlotDrop;
  };

  it.each([
    ['at the start', 5, 0],
    ['in the middle', 20, 1],
    ['at the end', 500, 3],
  ])('drops %s', (_n, x, index) => {
    expect(drag(x)).toHaveBeenCalledWith({ bookId: 'd', rowId: 'r1', index });
  });

  it('starts a drag with the book id and shows the dashed slot while over a row', () => {
    const { container } = setup();
    const dt = new FakeDataTransfer();
    fireEvent(screen.getByRole('button', { name: 'Dune, Herbert' }), createEvent.dragStart(screen.getByRole('button', { name: 'Dune, Herbert' }), { dataTransfer: dt }));
    expect(dt.getData('application/x-bookeeper-book')).toBe('a');
    const strip = layOut('Ripiano 2');
    dragEvent('dragOver', strip, dt, 100);
    expect(container.querySelectorAll('.slot')).toHaveLength(1);
  });

  it('ignores other data types', () => {
    const dt = new FakeDataTransfer();
    dt.setData('text/plain', 'd');
    expect(drag(30, 'Ripiano 1', dt)).not.toHaveBeenCalled();
  });
});

describe('keyboard', () => {
  it('moves a spine with space, arrows and enter', async () => {
    const { onSlotDrop } = setup();
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('status')).toHaveTextContent('preso Dune');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('status')).toHaveTextContent('Dune su Ripiano 1 posto 2');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('status')).toHaveTextContent('Dune su Ripiano 2 posto 2');
    await user.keyboard('{Enter}');
    expect(onSlotDrop).toHaveBeenCalledExactlyOnceWith({ bookId: 'a', rowId: 'r2', index: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('posato Dune su Ripiano 2 posto 2');
  });

  it('drops with space and moves up', async () => {
    const { onSlotDrop } = setup();
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Solaris, Lem' }).focus();
    await user.keyboard(' {ArrowUp} ');
    expect(onSlotDrop).toHaveBeenCalledExactlyOnceWith({ bookId: 'd', rowId: 'r1', index: 0 });
  });

  it('cancels with Escape and calls nothing', async () => {
    const { onSlotDrop } = setup();
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard(' {ArrowRight}{Escape}');
    expect(onSlotDrop).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('annullato Dune');
    await user.keyboard('{Enter}');
    expect(onSlotDrop).not.toHaveBeenCalled();
  });
});

describe('ShelfUnit read-only and defaults', () => {
  it('renders without spineLabel and disables dragging when readOnly', () => {
    render(<ShelfUnit color={SHELF_COLORS[0]!} rows={rows} readOnly onSlotDrop={() => {}} />);
    const b = screen.getAllByRole('button')[0]!;
    expect(b.getAttribute('draggable')).toBe('false');
  });
  it('is not draggable without onSlotDrop', () => {
    render(<ShelfUnit color={SHELF_COLORS[0]!} rows={rows} />);
    expect(screen.getAllByRole('button')[0]!.getAttribute('draggable')).toBe('false');
  });
});
