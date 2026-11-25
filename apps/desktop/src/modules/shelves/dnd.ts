import { createEvent, fireEvent, screen } from '@testing-library/react';
import { BOOK_MIME } from './model';

class FakeDataTransfer {
  data = new Map<string, string>();
  effectAllowed = 'all';
  dropEffect = 'none';
  get types() {
    return [...this.data.keys()];
  }
  setData(t: string, v: string) {
    this.data.set(t, v);
  }
  getData(t: string) {
    return this.data.get(t) ?? '';
  }
}

/** Gives each spine of a row a 20px box, so drop positions can be computed in jsdom. */
function layOut(rowName: string): HTMLElement {
  const row = screen.getByRole('group', { name: rowName });
  row.querySelectorAll<HTMLElement>('[data-spine-id]').forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 20, width: 20, right: i * 20 + 20, top: 0, bottom: 0, height: 0, x: i * 20, y: 0, toJSON() {} });
  });
  return row.firstElementChild as HTMLElement;
}

/** Drops a book on a row; `clientX` picks the position (each spine is 20px wide, starting at 0). */
export function dropOnRow(bookId: string, rowName: string, clientX: number): void {
  const dt = new FakeDataTransfer();
  dt.setData(BOOK_MIME, bookId);
  const strip = layOut(rowName);
  for (const type of ['dragOver', 'drop'] as const) {
    const event = createEvent[type](strip, { dataTransfer: dt });
    Object.defineProperty(event, 'clientX', { value: clientX });
    fireEvent(strip, event);
  }
}

/** Starts a drag the way a row of the unplaced list does, returning what was put on the transfer. */
export function startDrag(el: Element): FakeDataTransfer {
  const dt = new FakeDataTransfer();
  fireEvent(el, createEvent.dragStart(el, { dataTransfer: dt }));
  return dt;
}
