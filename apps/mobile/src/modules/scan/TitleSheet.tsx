import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import type { Typed } from './shelfFlow';
import styles from './Sheet.module.css';

export interface TitleSheetProps {
  /** The ISBN nothing is known about; `null` keeps the sheet closed. */
  isbn: string | null;
  onSkip: () => void;
  onTitle: (typed: Typed) => void;
}

function Form({ isbn, onSkip, onTitle }: { isbn: string; onSkip: () => void; onTitle: (typed: Typed) => void }) {
  const t = useT();
  const [typing, setTyping] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setMissing(true);
    onTitle({ title: title.trim(), author: author.trim() || undefined });
  };

  return (
    <>
      <p className={styles.muted}>
        {t('mscan.shelf.none.text')} {t('mscan.sheet.isbn', { isbn })}
      </p>
      {typing ? (
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field label={t('mscan.sheet.none.titleLabel')} error={missing ? t('mscan.sheet.none.needTitle') : undefined}>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMissing(false);
              }}
              autoComplete="off"
              enterKeyHint="next"
            />
          </Field>
          <Field label={t('mscan.shelf.none.authorLabel')}>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} autoComplete="off" enterKeyHint="done" />
          </Field>
          <Button type="submit" variant="primary">
            {t('mscan.shelf.none.create')}
          </Button>
        </form>
      ) : (
        <div className={styles.actions}>
          <Button variant="primary" onClick={() => setTyping(true)}>
            {t('mscan.shelf.none.type')}
          </Button>
          <Button variant="secondary" onClick={onSkip}>
            {t('mscan.shelf.none.skip')}
          </Button>
        </div>
      )}
    </>
  );
}

/** The lookup found nothing: skip the code, or type a title (and maybe an author) to create the book. */
export function TitleSheet({ isbn, onSkip, onTitle }: TitleSheetProps) {
  const t = useT();
  return (
    <BottomSheet open={isbn !== null} onOpenChange={(open) => !open && onSkip()} title={t('mscan.sheet.none.title')}>
      {isbn ? <Form key={isbn} isbn={isbn} onSkip={onSkip} onTitle={onTitle} /> : null}
    </BottomSheet>
  );
}
