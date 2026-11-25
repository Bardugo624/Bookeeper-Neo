import { useState } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { parseIsbn } from './isbn';
import styles from './BookForm.module.css';
import { useIsbnLookup, type LookupOutcome } from './useIsbnLookup';

export interface IsbnStepProps {
  /** `outcome` is null when the user chose to type everything by hand. */
  onDone(result: { isbn: string; outcome: LookupOutcome | null }): void;
}

/** First step of "New book": look an ISBN up, or skip to the empty form. */
export function IsbnStep({ onDone }: IsbnStepProps) {
  const t = useT();
  const [raw, setRaw] = useState('');
  const [invalid, setInvalid] = useState(false);
  const lookup = useIsbnLookup();

  const search = () => {
    const parsed = parseIsbn(raw);
    setInvalid(parsed === null);
    // A wrong check digit never reaches the network.
    if (!parsed || lookup.isPending) return;
    lookup.mutate(parsed.digits, { onSuccess: (outcome) => onDone({ isbn: parsed.digits, outcome }) });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        search();
      }}
      noValidate
    >
      <Field label={t('books.lookup.isbn')} description={t('books.lookup.hint')} error={invalid ? t('books.lookup.invalid') : undefined}>
        <Input name="isbn" inputMode="numeric" value={raw} autoFocus onChange={(e) => setRaw(e.target.value)} />
      </Field>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" loading={lookup.isPending} loadingLabel={t('books.lookup.searching')}>
          {t('books.lookup.search')}
        </Button>
        <Button variant="ghost" onClick={() => onDone({ isbn: '', outcome: null })}>
          {t('books.lookup.manual')}
        </Button>
      </div>
    </form>
  );
}
