import type { ComponentProps } from 'react';
import { cx } from './cx';
import { useFieldControl } from './Field';
import styles from './Input.module.css';

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, id, 'aria-describedby': describedBy, ...rest }: TextareaProps) {
  const field = useFieldControl();
  return (
    <textarea
      {...rest}
      id={field?.id ?? id}
      aria-describedby={[field?.describedBy, describedBy].filter(Boolean).join(' ') || undefined}
      aria-invalid={field?.invalid ? true : rest['aria-invalid']}
      className={cx(styles.control, styles.multiline, className)}
    />
  );
}
