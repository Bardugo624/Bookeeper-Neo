import { useState, type FormEvent } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import styles from './Scan.module.css';

/** Typing the ISBN when the camera cannot be used; the check digit decides whether it is accepted. */
export function ManualIsbn({ onSubmit }: { onSubmit: (text: string) => boolean }) {
  const t = useT();
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setInvalid(!onSubmit(text));
  };

  return (
    <form className={styles.manual} onSubmit={submit} noValidate>
      <Field
        label={t('mscan.manual.label')}
        description={t('mscan.manual.description')}
        error={invalid ? t('mscan.manual.invalid') : undefined}
      >
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </Field>
      <Button type="submit" variant="primary">
        {t('mscan.manual.submit')}
      </Button>
    </form>
  );
}
