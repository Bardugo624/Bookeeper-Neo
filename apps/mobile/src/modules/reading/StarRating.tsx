import { useId, useRef, type KeyboardEvent } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { bodyFrom } from './readingModel';
import { useSetReading } from './useReading';
import styles from './Reading.module.css';

const STARS = [1, 2, 3, 4, 5];

/** Five stars as a group of options; touching the chosen star takes the rating away. */
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
    const at = Number((event.target as HTMLElement).dataset.star) || rating || 1;
    const moves: Record<string, number> = {
      ArrowRight: Math.min(5, at + 1),
      ArrowUp: Math.min(5, at + 1),
      ArrowLeft: Math.max(1, at - 1),
      ArrowDown: Math.max(1, at - 1),
      Home: 1,
      End: 5,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    if (to !== rating) choose(to);
    group.current?.querySelector<HTMLElement>(`[data-star="${to}"]`)?.focus();
  };
  return (
    <div className={styles.field}>
      <span className={styles.label} id={labelId}>
        {t('mreading.rating.label')}
      </span>
      <div ref={group} role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown} className={styles.stars}>
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            data-star={n}
            aria-checked={rating === n}
            aria-label={t('mreading.rating.star', { count: n })}
            tabIndex={rating === n || (rating === 0 && n === 1) ? 0 : -1}
            className={n <= rating ? styles.starOn : styles.star}
            onClick={() => choose(rating === n ? 0 : n)}
          >
            <span aria-hidden="true">★</span>
          </button>
        ))}
      </div>
      {set.error ? (
        <p role="alert" className={styles.error}>
          {apiErrorMessage(t, set.error)}
        </p>
      ) : null}
    </div>
  );
}
