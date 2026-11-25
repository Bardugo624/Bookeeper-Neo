import { Button, Field, IconButton, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { LIMITS } from './bookForm';
import styles from './BookForm.module.css';

export interface AuthorsFieldProps {
  value: string[];
  error?: string;
  onChange(next: string[]): void;
}

/** Authors as an editable list: one input per author, "Add author" at the end. */
export function AuthorsField({ value, error, onChange }: AuthorsFieldProps) {
  const t = useT();
  const set = (i: number, text: string) => onChange(value.map((a, j) => (j === i ? text : a)));
  return (
    <fieldset className={styles.authors}>
      <legend className={styles.legend}>{t('books.form.authors')}</legend>
      {value.map((author, i) => (
        <div key={i} className={styles.authorRow}>
          <Field label={t('books.form.authorN', { n: i + 1 })} error={i === 0 ? error : undefined}>
            <Input name={i === 0 ? 'authors' : undefined} value={author} onChange={(e) => set(i, e.target.value)} />
          </Field>
          <IconButton
            icon="close"
            label={t('books.form.removeAuthor', { n: i + 1 })}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      {value.length === 0 && error ? <p className={styles.error}>{error}</p> : null}
      <Button
        variant="secondary"
        size="sm"
        icon="plus"
        disabled={value.length >= LIMITS.authors}
        onClick={() => onChange([...value, ''])}
      >
        {t('books.form.addAuthor')}
      </Button>
    </fieldset>
  );
}
