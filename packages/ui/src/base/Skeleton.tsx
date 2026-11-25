import type { CSSProperties } from 'react';
import { cx } from './cx';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** `line` is a short text-height bar; `rect` fills the given size. */
  shape?: 'rect' | 'line';
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ shape = 'rect', width, height, className }: SkeletonProps) {
  const style: CSSProperties = { width, height };
  return <div aria-hidden="true" className={cx(styles.skeleton, shape === 'line' && styles.line, className)} style={style} />;
}
