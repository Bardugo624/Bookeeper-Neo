import { useId, useState } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { Textarea } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { NOTE_MAX, bodyFrom } from './readingModel';
import { useSetReading } from './useReading';
import styles from './Reading.module.css';

/** The note is saved when the field loses focus, only when it changed and never when it is only spaces. */
export function NoteField({ reading }: { reading: ReadingOut }) {
  const t = useT();
  const id = useId();
  const set = useSetReading(reading.book_id);
  const saved = reading.note ?? '';
  // What was typed and not yet saved; it stays after a refusal and `null` means "follow the saved note".
  const [draft, setDraft] = useState<string | null>(null);

  const onBlur = () => {
    if (draft === null) return;
    const text = draft.trim();
    if (text === saved || (text === '' && draft !== '')) {
      setDraft(null);
      return;
    }
    set.mutate(bodyFrom(reading, { note: text === '' ? null : text }), {
      onSuccess: () => setDraft((now) => (now === draft ? null : now)),
    });
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {t('mreading.note.label')}
      </label>
      <Textarea
        id={id}
        value={draft ?? saved}
        rows={3}
        maxLength={NOTE_MAX}
        placeholder={t('mreading.note.placeholder')}
        className={styles.note}
        onChange={(e) => {
          setDraft(e.target.value);
          set.reset();
        }}
        onBlur={onBlur}
        aria-invalid={set.error ? true : undefined}
      />
      {set.error ? (
        <p role="alert" className={styles.error}>
          {apiErrorMessage(t, set.error)}
        </p>
      ) : null}
    </div>
  );
}
