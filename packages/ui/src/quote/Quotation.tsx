import type { QuoteSize } from './size';
import type { QuoteText } from './data';
import styles from './Quotation.module.css';

export interface QuotationProps {
  quote: QuoteText;
  size: QuoteSize;
  className?: string;
}

/** A quotation as a book would set it: one block per verse, a verse too long for the column carries on indented. */
export function Quotation({ quote, size, className }: QuotationProps) {
  const lines = quote.text.split('\n');
  const verse = lines.length > 1;
  return (
    <figure className={[styles.quote, className].filter(Boolean).join(' ')}>
      <blockquote className={styles.text} style={{ fontSize: size }}>
        {lines.map((line, i) => (
          <span key={i} className={verse ? `${styles.line} ${styles.verse}` : styles.line}>
            {i === 0 && (
              <span className={`${styles.mark} ${styles.open}`} aria-hidden="true">
                «
              </span>
            )}
            {line}
            {i === lines.length - 1 && (
              <span className={styles.mark} aria-hidden="true">
                »
              </span>
            )}
          </span>
        ))}
      </blockquote>
      <figcaption className={styles.caption}>
        {quote.author}
        {quote.work !== null && (
          <>
            {' · '}
            <cite className={styles.work}>{quote.work}</cite>
          </>
        )}
      </figcaption>
    </figure>
  );
}
