import type { ComponentProps } from 'react';
import { cx } from './cx';
import styles from './Kbd.module.css';

export function Kbd({ className, ...rest }: ComponentProps<'kbd'>) {
  return <kbd {...rest} className={cx(styles.kbd, className)} />;
}
