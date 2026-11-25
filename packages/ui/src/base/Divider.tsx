import { cx } from './cx';
import styles from './Divider.module.css';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function Divider({ orientation = 'horizontal', className }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cx(styles.divider, orientation === 'vertical' ? styles.vertical : styles.horizontal, className)}
    />
  );
}
