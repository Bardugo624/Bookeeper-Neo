import { useEffect, useId, useState } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { Textarea } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { NOTE_COUNT_FROM, NOTE_MAX, bodyFrom } from './readingModel';
import { fieldError } from './fieldError';
import { useSetReading } from './useReading';
import styles from './ReadingCard.module.css';

/** The note is saved when the field loses focus, and only when it changed. */
export function NoteField({ reading }: { reading: ReadingOut }) {
  const t = useT();
  const id = useId();
  const set = useSetReading(reading.book_id);
  const saved = reading.note ?? '';
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);

  const onBlur = () => {
    if (text === saved) return;
    set.mutate(bodyFrom(reading, { note: text.trim() === '' ? null : text }));
  };
  const error = fieldError(t, set.error);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {t('reading.note.label')}
      </label>
      <Textarea
        id={id}
        value={text}
        rows={3}
        maxLength={NOTE_MAX}
        placeholder={t('reading.note.placeholder')}
        onChange={(e) => {
          setText(e.target.value);
          set.reset();
        }}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
      />
      {text.length > NOTE_COUNT_FROM ? (
        <p role="status" className={styles.count}>
          {t('reading.note.count', { count: text.length, max: NOTE_MAX })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
