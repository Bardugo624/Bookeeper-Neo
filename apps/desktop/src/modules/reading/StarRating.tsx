import { useId, useRef, type KeyboardEvent } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { useT } from '../../app';
import { bodyFrom } from './readingModel';
import { fieldError } from './fieldError';
import { useSetReading } from './useReading';
import styles from './ReadingCard.module.css';

const STARS = [1, 2, 3, 4, 5];

/** Five stars as a group of options: arrows move, choosing the chosen star (or "Clear") removes it. */
export function StarRating({ reading }: { reading: ReadingOut }) {
  const t = useT();
  const set = useSetReading(reading.book_id);
  const labelId = useId();
  const group = useRef<HTMLDivElement>(null);
  const rating = reading.rating ?? 0;
  const choose = (value: number) => {
    set.reset();
    set.mutate(bodyFrom(reading, { rating: value === 0 ? null : value }));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // Arrows move from the star that has the focus, which is the first one while nothing is chosen.
    const at = Number((event.target as HTMLElement).dataset.star) || rating || 1;
    const next: Record<string, number> = {
      ArrowRight: Math.min(5, at + 1),
      ArrowUp: Math.min(5, at + 1),
      ArrowLeft: Math.max(1, at - 1),
      ArrowDown: Math.max(1, at - 1),
      Home: 1,
      End: 5,
    };
    const to = next[event.key];
    if (to === undefined) return;
    event.preventDefault();
    if (to !== rating) choose(to);
    group.current?.querySelector<HTMLElement>(`[data-star="${to}"]`)?.focus();
  };
  const error = fieldError(t, set.error);
  return (
    <div className={styles.field}>
      <span className={styles.label} id={labelId}>
        {t('reading.rating.label')}
      </span>
      <div className={styles.stars}>
        <div ref={group} role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className={styles.starGroup}>
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              data-star={n}
              aria-checked={rating === n}
              aria-label={t('reading.rating.star', { count: n })}
              // The group is one stop of the Tab key: the chosen star, or the first.
              tabIndex={rating === n || (rating === 0 && n === 1) ? 0 : -1}
              className={n <= rating ? styles.starOn : styles.star}
              onClick={() => choose(rating === n ? 0 : n)}
            >
              <span aria-hidden="true">★</span>
            </button>
          ))}
        </div>
        {rating > 0 ? (
          <button type="button" className={styles.clear} onClick={() => choose(0)}>
            {t('reading.rating.clear')}
          </button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
