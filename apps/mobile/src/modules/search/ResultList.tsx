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

/** Height of one row: its minimum height plus the 1px divider. */
export const ROW_HEIGHT = 89;
const OVERSCAN = 6;

const scrollParent = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if (y === 'auto' || y === 'scroll') return p;
  }
  return null;
};

/** Which rows [start, end) are near the viewport; the page's own scrolling is only listened to. */
function useWindow(count: number) {
  const listRef = useRef<HTMLUListElement>(null);
  const [range, setRange] = useState<[number, number]>([0, Math.min(count, 2 * OVERSCAN + 10)]);
  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const parent = scrollParent(list);
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
    const start = Math.max(0, Math.floor(offset / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(count, Math.max(start, Math.ceil((offset + height) / ROW_HEIGHT) + OVERSCAN));
    setRange((r) => (r[0] === start && r[1] === end ? r : [start, end]));
  }, [count]);
  useLayoutEffect(() => {
    measure();
  }, [measure]);
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
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);
  return { listRef, start: Math.min(range[0], count), end: Math.min(range[1], count) };
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
  const { listRef, start, end } = useWindow(items.length);
  return (
    <>
      <ul
        ref={listRef}
        className={styles.list}
        aria-label={t('msearch.list.label')}
        aria-busy={busy}
        style={{ paddingTop: start * ROW_HEIGHT, paddingBottom: (items.length - end) * ROW_HEIGHT }}
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
