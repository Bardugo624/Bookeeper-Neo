import type { ComponentProps } from 'react';
import { cx } from './cx';
import styles from './Tag.module.css';

export interface TagProps extends ComponentProps<'span'> {
  tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'danger';
}

export function Tag({ tone = 'neutral', className, ...rest }: TagProps) {
  return <span {...rest} className={cx(styles.tag, styles[tone], className)} />;
}
