import { useCallback, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';

/** Up to this many items everything is rendered; beyond it only the rows in view (plus a margin) are. */
export const WINDOW_THRESHOLD = 200;

/** Rows kept above and below the visible ones. */
const OVERSCAN = 3;
const FALLBACK_VIEWPORT = 800;

export interface WindowedRowsOptions {
  count: number;
  /** Height of one row including the gap that follows it, in px. */
  pitch: number;
  /** Items per row for a container this wide (px); omitted means one per row. */
  columns?: (width: number) => number;
  /** The list scrolls inside itself (it has its own height limit) instead of with the page. */
  own?: boolean;
}

export interface WindowedItem {
  index: number;
  /** Space (px) left by the rows skipped just before this item, one item per row only. */
  gapBefore: number;
}

interface View {
  first: number;
  last: number;
  cols: number;
}

/** Pure part: which rows are visible, given how far the container is scrolled past its own top. */
export function visibleRows(args: { count: number; cols: number; pitch: number; offset: number; viewport: number }): {
  first: number;
  last: number;
} {
  const rows = Math.max(1, Math.ceil(args.count / args.cols));
  const first = Math.floor(args.offset / args.pitch) - OVERSCAN;
  const last = Math.ceil((args.offset + args.viewport) / args.pitch) + OVERSCAN;
  return {
    first: Math.min(Math.max(first, 0), rows - 1),
    last: Math.min(Math.max(last, 0), rows - 1),
  };
}

/**
 * Window over a long list that scrolls with the page: the returned `items` are the indices to render.
 * The list keeps its full height (`totalHeight`) so the page scrollbar and scroll restoration stay right.
 * An item that holds the focus is always rendered, wherever the window is.
 */
export function useWindowedRows<E extends HTMLElement>({ count, pitch, columns, own }: WindowedRowsOptions) {
  const ref = useRef<E>(null);
  const windowed = count > WINDOW_THRESHOLD;
  const [view, setView] = useState<View>({ first: 0, last: 0, cols: 1 });
  const [focused, setFocused] = useState<number | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewport = (own ? el.clientHeight : window.innerHeight) || FALLBACK_VIEWPORT;
    const width = el.clientWidth || rect.width;
    const cols = columnsRef.current ? Math.max(1, columnsRef.current(width)) : 1;
    const { first, last } = visibleRows({
      count,
      cols,
      pitch,
      offset: own ? el.scrollTop : Math.max(0, -rect.top),
      viewport,
    });
    setView((v) => (v.first === first && v.last === last && v.cols === cols ? v : { first, last, cols }));
  }, [count, pitch, own]);

  useLayoutEffect(() => {
    if (!windowed) return;
    measure();
    if (!own) window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [windowed, own, measure]);

  const onFocus = useCallback((e: FocusEvent<HTMLElement>) => {
    const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    const index = holder ? Number(holder.dataset.index) : NaN;
    setFocused(Number.isInteger(index) ? index : null);
  }, []);
  const onBlur = useCallback((e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(null);
  }, []);

  const cols = windowed ? view.cols : 1;
  const items: WindowedItem[] = [];
  let tail = 0;
  if (!windowed) {
    for (let i = 0; i < count; i++) items.push({ index: i, gapBefore: 0 });
  } else {
    const start = Math.min(view.first * cols, count);
    const end = Math.min((view.last + 1) * cols, count);
    const indices: number[] = [];
    if (focused !== null && focused >= 0 && focused < count && (focused < start || focused >= end)) {
      if (focused < start) indices.push(focused);
      for (let i = start; i < end; i++) indices.push(i);
      if (focused >= end) indices.push(focused);
    } else {
      for (let i = start; i < end; i++) indices.push(i);
    }
    let prevRow = -1;
    for (const index of indices) {
      const row = Math.floor(index / cols);
      items.push({ index, gapBefore: Math.max(0, row - prevRow - 1) * pitch });
      prevRow = row;
    }
    tail = Math.max(0, Math.ceil(count / cols) - 1 - prevRow) * pitch;
  }
  const rows = Math.ceil(count / cols);
  return {
    ref,
    windowed,
    cols,
    items,
    /** Space (px) after the last rendered row, one item per row only. */
    tail,
    /** Height of the whole list, in px, counting the gap after the last row. */
    totalHeight: rows * pitch,
    handlers: own ? { onFocus, onBlur, onScroll: measure } : { onFocus, onBlur },
  };
}
