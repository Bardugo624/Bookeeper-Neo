import type { CSSProperties } from 'react';
import { clothTone } from './clothTone';
import { useCoverImage } from './useCoverImage';
import styles from './Book3D.module.css';

export interface Book3DProps {
  title: string;
  author?: string;
  src?: string;
  color?: string;
  width?: number;
  pages?: number;
}

/** Spine thickness in px: 14 up to 100 pages, 40 from 800, linear between, 24 when unknown. */
export function spineThickness(pages?: number): number {
  if (pages === undefined || !Number.isFinite(pages)) return 24;
  const t = Math.min(1, Math.max(0, (pages - 100) / 700));
  return 14 + t * 26;
}

export function Book3D({ title, author, src, color, width = 240, pages }: Book3DProps) {
  const img = useCoverImage(src);
  const style = {
    '--book-w': `${width}px`,
    '--book-spine': `${spineThickness(pages)}px`,
    '--book-bg': color ?? clothTone(title),
  } as CSSProperties;
  return (
    <div className={styles.scene} style={style}>
      <div className={styles.book}>
        <div className={styles.spine} aria-hidden="true" />
        <div className={styles.cover}>
          {img.src ? (
            <img className={styles.img} src={img.src} alt="" loading="lazy" decoding="async" onError={img.onError} />
          ) : (
            <>
              <span className={styles.title}>{title}</span>
              {author ? <span className={styles.author}>{author}</span> : null}
            </>
          )}
        </div>
        <div className={styles.pages} aria-hidden="true" />
      </div>
    </div>
  );
}
