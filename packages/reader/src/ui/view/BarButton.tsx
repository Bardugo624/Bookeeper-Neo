import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from '@bookeeper/ui/overlays';
import { cx } from './cx';
import styles from './Bars.module.css';

export interface BarButtonProps extends Omit<ComponentProps<'button'>, 'children' | 'aria-label'> {
  icon: ReactNode;
  /** Accessible name; required. */
  label: string;
  /** Shown under the icon (phone). */
  caption?: string;
  active?: boolean;
  /** A tooltip with the label (computer). */
  tip?: boolean;
}

/** A button of the reader's bars, on the reader theme's surfaces. */
export function BarButton({ icon, label, caption, active = false, tip = false, className, type = 'button', ...rest }: BarButtonProps) {
  const button = (
    <button
      {...rest}
      type={type}
      aria-label={label}
      data-active={active || undefined}
      className={cx(styles.button, caption ? styles.captioned : undefined, className)}
    >
      {icon}
      {caption ? <span className={styles.caption}>{caption}</span> : null}
    </button>
  );
  return tip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
