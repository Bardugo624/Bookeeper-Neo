import { useId, useState, type FormEvent } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { bodyFrom } from './readingModel';
import { useSetReading } from './useReading';
import styles from './Reading.module.css';

export interface PageFieldProps {
  reading: ReadingOut;
  pageCount: number | null | undefined;
}

/** The current page: a number with less and more. Never above the pages of the book. */
export function PageField({ reading, pageCount }: PageFieldProps) {
  const t = useT();
  const id = useId();
  const set = useSetReading(reading.book_id, pageCount);
  const saved = reading.current_page ?? 0;
  const top = pageCount && pageCount > 0 ? pageCount : Number.MAX_SAFE_INTEGER;
  // What was typed and not yet sent; `null` while the field follows the saved page.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const save = (page: number) => {
    set.reset();
    setDraft(null);
    if (page !== saved) set.mutate(bodyFrom(reading, { current_page: page }));
  };
  const step = (by: number) => {
    setInvalid(false);
    save(Math.min(top, Math.max(0, saved + by)));
  };
  const commit = (event?: FormEvent) => {
    event?.preventDefault();
    if (draft === null) return;
    const value = draft.trim();
    if (!/^\d+$/.test(value)) {
      setInvalid(true);
      setDraft(null);
      return;
    }
    setInvalid(false);
    save(Math.min(top, Number(value)));
  };
  const error = invalid ? t('mreading.field.page.invalid') : set.error ? apiErrorMessage(t, set.error) : null;
  const errorId = `${id}-error`;
  return (
    <form className={styles.field} onSubmit={commit} noValidate>
      <label htmlFor={id} className={styles.label}>
        {t('mreading.field.page.label')}
      </label>
      <div className={styles.stepper}>
        <button type="button" className={styles.step} aria-label={t('mreading.field.page.less')} disabled={saved <= 0} onClick={() => step(-1)}>
          <Icon name="minimize" size={18} />
        </button>
        <input
          id={id}
          name="current_page"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className={styles.pageInput}
          value={draft ?? String(saved)}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
            set.reset();
          }}
          onBlur={() => commit()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button type="button" className={styles.step} aria-label={t('mreading.field.page.more')} disabled={saved >= top} onClick={() => step(1)}>
          <Icon name="plus" size={18} />
        </button>
        {pageCount ? <span className={styles.total}>{t('mreading.field.page.of', { total: pageCount })}</span> : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
