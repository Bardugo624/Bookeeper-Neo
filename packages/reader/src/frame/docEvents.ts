import type { FromFrame, Rect } from '../engine/protocol';

export interface FoliateViewLike extends HTMLElement {
  book: { dir?: string } | undefined;
  getCFI(index: number, range?: Range): string;
}

/** A rectangle of a book page, moved to the frame's own coordinates (the page is an iframe inside the frame). */
export function toFrameRect(rect: DOMRect, doc: Document): Rect {
  const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
  return { x: rect.x + (frame?.x ?? 0), y: rect.y + (frame?.y ?? 0), width: rect.width, height: rect.height };
}

/** The third of the page that `x` falls in; in right-to-left books the thirds trade places. */
export function zoneOf(x: number, width: number, rtl: boolean): 'start' | 'center' | 'end' {
  const third = width / 3;
  const zone = x < third ? 'start' : x >= width - third ? 'end' : 'center';
  if (!rtl || zone === 'center') return zone;
  return zone === 'start' ? 'end' : 'start';
}

const SELECTION_DELAY_MS = 200;

/**
 * Listens to a page of the book for what the view decides on: selections, taps and keys.
 * Returns the function that removes the listeners.
 */
export function watchDocument(
  doc: Document,
  index: number,
  view: FoliateViewLike,
  send: (msg: FromFrame) => void,
  markHit: () => boolean,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let selected = false;

  const onSelection = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const sel = doc.getSelection();
      const text = sel?.toString() ?? '';
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !text.trim()) {
        if (selected) send({ type: 'selection-cleared' });
        selected = false;
        return;
      }
      const range = sel.getRangeAt(0);
      selected = true;
      send({ type: 'selection', cfi: view.getCFI(index, range), text, rect: toFrameRect(range.getBoundingClientRect(), doc) });
    }, SELECTION_DELAY_MS);
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (target?.closest?.('a[href]')) return;
    if (!doc.getSelection()?.isCollapsed) return;
    const offset = doc.defaultView?.frameElement?.getBoundingClientRect().x ?? 0;
    const zone = zoneOf(e.clientX + offset, window.innerWidth, view.book?.dir === 'rtl');
    // A click on a mark is the view's to answer as a mark click, not as a tap. foliate-js reports it in the same turn.
    setTimeout(() => {
      if (!markHit()) send({ type: 'tap', zone });
    }, 0);
  };

  const onKey = (e: KeyboardEvent) =>
    send({ type: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey });

  doc.addEventListener('selectionchange', onSelection);
  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKey);
  return () => {
    clearTimeout(timer);
    doc.removeEventListener('selectionchange', onSelection);
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKey);
  };
}
