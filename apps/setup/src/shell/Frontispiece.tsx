import { useLayoutEffect, useRef } from 'react';
import { Quotation, quoteSize } from '@bookeeper/ui/quote';
import { useLocale } from './i18n';
import { resolveQuote, type QuoteRef } from './quotes';
import styles from './Frontispiece.module.css';

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
  const size = shown ? quoteSize(shown.text, { columnPx: 600, compact }) : 33;
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
      <Quotation key={shown.id} quote={shown} size={size} className={styles.quote} />
    </div>
  );
}
