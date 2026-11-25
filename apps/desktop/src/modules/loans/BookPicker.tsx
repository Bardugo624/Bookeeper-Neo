import { useState } from 'react';
import { Button, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { authorsOf } from './loanStatus';
import { useBookSearch } from './useBookSearch';
import styles from './BookPicker.module.css';

export interface PickedBook {
  id: string;
  title: string;
}

export interface BookPickerProps {
  value: PickedBook | null;
  error?: string;
  onChange(book: PickedBook | null): void;
}

/** Search among the books that are not on loan; once one is chosen it shows as a line with "Change". */
export function BookPicker({ value, error, onChange }: BookPickerProps) {
  const t = useT();
  const [text, setText] = useState('');
  const { books, isPending, isError, settled } = useBookSearch(text, value === null);

  if (value) {
    return (
      <div className={styles.group} role="group" aria-label={t('loans.form.book')}>
        <span className={styles.label}>{t('loans.form.book')}</span>
        <div className={styles.chosen}>
          <strong className={styles.chosenTitle}>{value.title}</strong>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            {t('loans.form.changeBook')}
          </Button>
        </div>
      </div>
    );
  }
  const describedBy = error ? 'loan-book-error' : undefined;
  return (
    <div className={styles.group}>
      <label htmlFor="loan-book-search" className={styles.label}>
        {t('loans.form.book')}
      </label>
      <Input
        id="loan-book-search"
        name="book_id"
        type="text"
        role="searchbox"
        placeholder={t('loans.form.bookSearch')}
        value={text}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setText(e.target.value)}
      />
      <ul className={styles.results} aria-label={t('loans.form.bookResults')} aria-busy={isPending || !settled}>
        {books.map((b) => (
          <li key={b.id}>
            <button type="button" className={styles.option} onClick={() => onChange({ id: b.id, title: b.title })}>
              <span className={styles.optionTitle}>{b.title}</span>
              {authorsOf({ book_authors: b.authors }) ? (
                <span className={styles.optionAuthor}>{b.authors.join(', ')}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {!isPending && !isError && settled && books.length === 0 ? (
        <p className={styles.hint}>{t('loans.form.noBooks')}</p>
      ) : null}
      {isError ? (
        <p role="alert" className={styles.errorText}>
          {t('loans.form.bookSearchError')}
        </p>
      ) : null}
      {error ? (
        <p id="loan-book-error" className={styles.errorText}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
