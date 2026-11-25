import { useId, type HTMLInputTypeAttribute } from 'react';
import { Field, Input } from '@bookeeper/ui/base';
import styles from './form.module.css';

export interface TextFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  type?: HTMLInputTypeAttribute;
  disabled?: boolean;
  autoComplete?: string;
}

/** A labelled input whose error sits right under it, announced as an alert. */
export function TextField({ name, label, value, onChange, error, hint, type = 'text', disabled, autoComplete }: TextFieldProps) {
  const errorId = useId();
  return (
    <Field label={label} description={hint}>
      <Input
        name={name}
        type={type}
        value={value}
        disabled={disabled}
        autoComplete={autoComplete ?? 'off'}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </Field>
  );
}
