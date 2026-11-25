import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../base/cx';
import { clothTone } from './clothTone';
import { initialOf, useCoverImage } from './useCoverImage';
import styles from './BookCover.module.css';

export interface BookCoverProps {
  title: string;
  author?: string;
  src?: string;
  color?: string;
  width?: number;
  lift?: boolean;
  className?: string;
  children?: ReactNode;
}

export function BookCover({ title, src, color, width = 144, lift, className, children }: BookCoverProps) {
  const img = useCoverImage(src);
  const style = { width, '--cover-bg': color ?? clothTone(title) } as CSSProperties;
  return (
    <div className={cx(styles.cover, lift && styles.lift, className)} style={style}>
      {img.src ? (
        <img className={styles.img} src={img.src} alt="" loading="lazy" decoding="async" onError={img.onError} />
      ) : (
        <span className={styles.initial} aria-hidden="true" style={{ fontSize: width * 0.42 }}>
          {initialOf(title)}
        </span>
      )}
      <span className={styles.fold} aria-hidden="true" />
      <span className={styles.light} aria-hidden="true" />
      {children}
    </div>
  );
}
