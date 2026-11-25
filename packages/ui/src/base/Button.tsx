import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

interface ButtonBaseProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
}

/** `loadingLabel` (already translated by the caller) is required whenever `loading` can be true. */
export type ButtonProps = ButtonBaseProps &
  (
    | { loading?: false; loadingLabel?: string }
    | { loading: boolean; loadingLabel: string }
  );

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  loadingLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(styles.button, styles[variant], styles[size], className)}
    >
      {loading ? <Spinner label={loadingLabel ?? ''} size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}
