import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { LIMITS, validateWish, type WishErrors, type WishValues } from './model';
import { PriorityChoice } from './PriorityChoice';
import styles from './Wishlist.module.css';

export interface WishFormProps {
  initial: WishValues;
  submitLabel: string;
  /** Sends the values; a rejection is shown under the fields. */
  onSubmit: (values: WishValues) => Promise<unknown>;
}

const MAX = { title: LIMITS.title, authors: LIMITS.authors, isbn: LIMITS.isbn } as const;

/** Title, authors, ISBN and priority; nothing is sent while the title is missing or a field is too long. */
export function WishForm({ initial, submitLabel, onSubmit }: WishFormProps) {
  const t = useT();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<WishErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: keyof WishValues, value: string) => {
    setValues((cur) => ({ ...cur, [name]: value }));
    setErrors((cur) => ({ ...cur, [name]: undefined }));
  };
  const message = (name: keyof WishErrors) => {
    const key = errors[name];
    return key ? t(`mwishlist.form.errors.${key}`, { max: MAX[name] }) : undefined;
  };
  const text = (name: 'title' | 'authors' | 'isbn') => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) => set(name, e.target.value),
    autoComplete: 'off',
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validateWish(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFailure(null);
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (error) {
      setFailure(apiErrorMessage(t, error));
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
      <Field label={t('mwishlist.form.title')} error={message('title')}>
        <Input {...text('title')} enterKeyHint="next" />
      </Field>
      <Field label={t('mwishlist.form.authors')} description={t('mwishlist.form.authorsHint')} error={message('authors')}>
        <Input {...text('authors')} enterKeyHint="next" />
      </Field>
      <Field label={t('mwishlist.form.isbn')} error={message('isbn')}>
        <Input {...text('isbn')} inputMode="numeric" enterKeyHint="done" />
      </Field>
      <PriorityChoice value={values.priority} onChange={(v) => set('priority', v)} />
      {failure ? (
        <p className={styles.error} role="alert">
          {failure}
        </p>
      ) : null}
      <Button type="submit" variant="primary" loading={busy} loadingLabel={t('mwishlist.form.saving')}>
        {submitLabel}
      </Button>
    </form>
  );
}
