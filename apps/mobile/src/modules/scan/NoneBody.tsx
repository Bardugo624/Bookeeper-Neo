import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './Sheet.module.css';

export interface NoneBodyProps {
  isbn13: string;
  canWrite: boolean;
  adding: boolean;
  error: string | null;
  onAdd: (title: string) => void;
}

/** The core knows nothing of this ISBN: say so, and let a writer add it with a typed title. */
export function NoneBody({ isbn13, canWrite, adding, error, onAdd }: NoneBodyProps) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setMissing(true);
      return;
    }
    onAdd(title.trim());
  };

  return (
    <>
      <p className={styles.muted}>
        {t('mscan.sheet.none.text')} {t('mscan.sheet.isbn', { isbn: isbn13 })}
      </p>
      {canWrite ? (
        <form className={styles.form} onSubmit={submit} noValidate>
          <Field label={t('mscan.sheet.none.titleLabel')} error={missing ? t('mscan.sheet.none.needTitle') : undefined}>
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMissing(false);
              }}
              autoComplete="off"
              enterKeyHint="done"
            />
          </Field>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" loading={adding} loadingLabel={t('mscan.sheet.found.adding')}>
            {t('mscan.sheet.none.add')}
          </Button>
        </form>
      ) : (
        <p className={styles.muted}>{t('mscan.sheet.none.readOnly')}</p>
      )}
    </>
  );
}
