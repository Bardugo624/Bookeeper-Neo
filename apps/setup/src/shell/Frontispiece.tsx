import { useLayoutEffect, useRef } from 'react';
import { useLocale } from './i18n';
import { resolveQuote, type QuoteRef } from './quotes';
import styles from './Frontispiece.module.css';

/** Font size by length in the language on show: 33px up to 90 characters, 26px up to 140, 22px beyond. */
export function quoteSize(length: number, compact: boolean): 33 | 26 | 22 {
  if (compact) return 22;
  return length <= 90 ? 33 : length <= 140 ? 26 : 22;
}

/** Motion only when the person has not asked for less, as in the CSS: no `matchMedia` means no motion. */
function allowsMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

export interface FrontispieceProps {
  quote: QuoteRef;
  compact: boolean;
}

/** The quote page. Going compact is animated with FLIP: measure, resize, then play the difference with transform. */
export function Frontispiece({ quote, compact }: FrontispieceProps) {
  const locale = useLocale();
  const shown = resolveQuote(quote, locale);
  const size = shown ? quoteSize(shown.text.length, compact) : 33;
  const frame = useRef<HTMLDivElement>(null);
  const last = useRef<{ rect: DOMRect; compact: boolean; size: number } | null>(null);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const before = last.current;
    last.current = { rect, compact, size };
    if (!before || before.compact === compact || before.rect.width === 0 || !allowsMotion()) return;
    const scale = before.size / size;
    const dx = before.rect.left - rect.left;
    const dy = before.rect.top - rect.top;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    void el.offsetWidth; // commit the inverted state before playing it
    el.style.transition = 'transform var(--bk-dur-slow) var(--bk-ease)';
    el.style.transform = '';
  }, [compact, size, shown?.id]);

  if (!shown) return null;
  return (
    <div
      ref={frame}
      className={styles.frame}
      data-compact={compact || undefined}
      onTransitionEnd={(e) => {
        e.currentTarget.style.transition = '';
      }}
    >
      <figure key={shown.id} className={styles.quote}>
        <blockquote className={styles.text} style={{ fontSize: size }}>
          <span className={styles.mark} aria-hidden="true">
            «
          </span>
          {shown.text}
          <span className={styles.mark} aria-hidden="true">
            »
          </span>
        </blockquote>
        <figcaption className={styles.caption}>
          {shown.author} · <cite className={styles.work}>{shown.work}</cite>
        </figcaption>
      </figure>
    </div>
  );
}
