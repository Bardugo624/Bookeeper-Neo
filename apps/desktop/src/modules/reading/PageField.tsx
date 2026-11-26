import { useEffect, useId, useState, type FormEvent } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { IconButton, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { bodyFrom } from './readingModel';
import { fieldError } from './fieldError';
import { useSetReading } from './useReading';
import styles from './ReadingCard.module.css';

/** "Update the page": a number with less and more; Enter saves. */
export function PageField({ reading, pageCount }: { reading: ReadingOut; pageCount: number | null | undefined }) {
  const t = useT();
  const id = useId();
  const set = useSetReading(reading.book_id, pageCount);
  const saved = reading.current_page ?? 0;
  const [text, setText] = useState(String(saved));
  const [invalid, setInvalid] = useState(false);
  // The field follows the saved page: after a refusal it goes back to it.
  useEffect(() => setText(String(saved)), [saved]);

  const save = (page: number) => {
    set.reset();
    // A refusal puts the saved page back even when no render happened in between.
    set.mutate(bodyFrom(reading, { current_page: page }), { onError: () => setText(String(saved)) });
  };
  const step = (by: number) => {
    const page = Math.max(0, saved + by);
    setInvalid(false);
    if (page !== saved) save(page);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!/^\d+$/.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (Number(value) !== saved) save(Number(value));
  };
  const error = invalid ? t('reading.page.invalid') : fieldError(t, set.error);
  const errorId = `${id}-error`;
  return (
    <form className={styles.field} onSubmit={onSubmit} noValidate>
      <label htmlFor={id} className={styles.label}>
        {t('reading.page.label')}
      </label>
      <div className={styles.stepper}>
        <IconButton icon="minimize" label={t('reading.page.less')} onClick={() => step(-1)} disabled={saved <= 0} />
        <Input
          id={id}
          name="current_page"
          type="number"
          min={0}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
            set.reset();
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={styles.pageInput}
        />
        <IconButton icon="plus" label={t('reading.page.more')} onClick={() => step(1)} />
      </div>
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
