import type { ComponentProps } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import styles from './IconButton.module.css';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: IconName;
  /** Accessible name; required. */
  label: string;
  size?: 'md' | 'sm';
  tone?: 'danger';
}

export function IconButton({ icon, label, size = 'md', tone, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button {...rest} type={type} aria-label={label} className={cx(styles.iconButton, styles[size], tone === 'danger' && styles.toneDanger, className)}>
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}
