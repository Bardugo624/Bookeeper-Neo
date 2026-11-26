import { useLocation } from 'react-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, Skeleton, Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BookRow } from './BookRow';
import { useEndReached } from './useBookSearch';
import styles from './ResultList.module.css';

export function ResultSkeletons() {
  const t = useT();
  return (
    <div role="status" aria-label={t('mobile.loading')} className={styles.skeletons}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={56} height={84} />
          <div className={styles.skeletonText}>
            <Skeleton shape="line" width="70%" />
            <Skeleton shape="line" width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Fallback height of one row: 84px cover (56px wide, 2:3) + 2 x 10px padding + 1px divider.
 * Every row is as tall (the stylesheet reserves two title lines and one author line), so the real
 * height is measured once from any row and again only when that row is resized (text size, width).
 */
export const ROW_HEIGHT = 105;
const OVERSCAN = 6;

const scrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
};

/**
 * Where each history entry was: `offset` px from the top of the list to the top of the view, also
 * as `rows` (in rows), so coming back lands on the same row even if the row height changed meanwhile.
 */
const savedScroll = new Map<string, { offset: number; rows: number }>();

/** Forgets every saved position; a fresh app (or test) starts from the top. */
export function forgetScrollPositions() {
  savedScroll.clear();
}

const heightOf = (el: Element | null | undefined) => el?.getBoundingClientRect().height ?? 0;

/** Which rows [start, end) are near the viewport; the page's own scrolling is only listened to. */
function useWindow(count: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
  const rowRef = useRef(ROW_HEIGHT);
  /** Whether a row has been measured (or found to have no layout, as in tests). */
  const measured = useRef(false);
  const locationKey = useLocation().key;
  /** Position to go back to, read once on mount; cleared after the one attempt to reach it. */
  const pending = useRef(savedScroll.get(locationKey) ?? null);
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 2 * OVERSCAN + 10)]);
  const setHeight = useCallback((h: number) => {
    if (h > 0 && Math.abs(h - rowRef.current) > 0.5) {
      rowRef.current = h;
      setRowHeight(h);
    }
  }, []);
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const parent = scrollParent(list);
    const rh = rowRef.current;
    const listTop = list.getBoundingClientRect().top;
    let offset: number;
    let height: number;
    if (parent) {
      offset = parent.getBoundingClientRect().top - listTop;
      height = parent.clientHeight || window.innerHeight;
    } else {
      offset = -listTop;
      height = window.innerHeight;
    }
    if (pending.current === null) savedScroll.set(locationKey, { offset, rows: offset / rh });
    const start = Math.max(0, Math.floor(offset / rh) - OVERSCAN);
    const end = Math.min(count, Math.max(start, Math.ceil((offset + height) / rh) + OVERSCAN));
    setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
  }, [count, locationKey]);
  const hasRows = Math.min(range[1], count) > Math.min(range[0], count);

  // Watch one row for size changes; when it leaves the DOM another row takes its place, unmeasured
  // (all rows are as tall), so scrolling never changes the height.
  const observed = useRef<{ row: Element; ro: ResizeObserver | null } | null>(null);
  useLayoutEffect(() => {
    const row = listRef.current?.firstElementChild;
    if (!row || (observed.current && observed.current.row.isConnected)) return;
    if (!measured.current) {
      measured.current = true;
      setHeight(heightOf(row));
    }
    let ro = observed.current?.ro ?? null;
    if (!ro && typeof ResizeObserver !== 'undefined') {
      /** Last size seen per row: the first report of a row only records it, a later change is measured. */
      const seen = new WeakMap<Element, number>();
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = heightOf(entry.target);
          const before = seen.get(entry.target);
          seen.set(entry.target, h);
          if (before !== undefined && Math.abs(h - before) > 0.5) setHeight(h);
        }
      });
    }
    ro?.disconnect();
    ro?.observe(row);
    observed.current = { row, ro };
  });
  useEffect(
    () => () => {
      observed.current?.ro?.disconnect();
      observed.current = null;
    },
    [],
  );

  useLayoutEffect(() => {
    const list = listRef.current;
    const want = pending.current;
    // Restore once the rows are there and their height is measured, so the spacers are final;
    // then stop, whether or not the position could be reached (a rotated or larger-text page may be shorter).
    if (list && want !== null && hasRows && measured.current && rowHeight === rowRef.current) {
      pending.current = null;
      const parent = scrollParent(list);
      const listTop = list.getBoundingClientRect().top;
      const at = parent ? parent.scrollTop + listTop - parent.getBoundingClientRect().top : window.scrollY + listTop;
      const y = Math.max(0, Math.round(at + (want.offset > 0 ? want.rows * rowHeight : want.offset)));
      if (parent) parent.scrollTop = y;
      else window.scrollTo(0, y);
    }
    measure();
  }, [measure, rowHeight, hasRows]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const target: HTMLElement | Window = scrollParent(list) ?? window;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // Without ResizeObserver a resize (rotation, text size) measures the row again.
    const onResize = () => {
      if (typeof ResizeObserver === 'undefined') setHeight(heightOf(listRef.current?.firstElementChild));
      onScroll();
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure, setHeight]);
  return { listRef, rowHeight, start: Math.min(range[0], count), end: Math.min(range[1], count) };
}

export interface ResultListProps {
  items: BookOut[];
  from: string;
  busy: boolean;
  hasNext: boolean;
  fetchingNext: boolean;
  nextFailed: boolean;
  onEnd: () => void;
}

/** One column of books; the next page is asked for when the end comes into view. */
export function ResultList({ items, from, busy, hasNext, fetchingNext, nextFailed, onEnd }: ResultListProps) {
  const t = useT();
  const endRef = useEndReached(onEnd, hasNext && !fetchingNext && !nextFailed, items.length);
  const { listRef, rowHeight, start, end } = useWindow(items.length);
  return (
    <>
      <ul
        ref={listRef}
        className={styles.list}
        aria-label={t('msearch.list.label')}
        aria-busy={busy}
        style={{ paddingTop: start * rowHeight, paddingBottom: (items.length - end) * rowHeight }}
      >
        {items.slice(start, end).map((book) => (
          <BookRow key={book.id} book={book} from={from} />
        ))}
      </ul>
      <div ref={endRef} className={styles.end}>
        {fetchingNext ? <Spinner label={t('msearch.list.loadingMore')} /> : null}
        {nextFailed && !fetchingNext ? (
          <div role="alert" className={styles.moreError}>
            <span>{t('msearch.list.moreError')}</span>
            <Button variant="secondary" onClick={onEnd}>
              {t('msearch.list.moreRetry')}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
