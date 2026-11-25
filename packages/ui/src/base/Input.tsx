import type { ComponentProps } from 'react';
import { cx } from './cx';
import { useFieldControl } from './Field';
import styles from './Input.module.css';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, id, 'aria-describedby': describedBy, ...rest }: InputProps) {
  const field = useFieldControl();
  return (
    <input
      {...rest}
      id={field?.id ?? id}
      aria-describedby={[field?.describedBy, describedBy].filter(Boolean).join(' ') || undefined}
      aria-invalid={field?.invalid ? true : rest['aria-invalid']}
      className={cx(styles.control, className)}
    />
  );
}
