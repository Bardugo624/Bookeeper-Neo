import type { ReactNode } from 'react';
import { Frontispiece } from './Frontispiece';
import type { QuoteRef } from './quotes';
import styles from './SetupLayout.module.css';

export interface SetupLayoutProps {
  quote: QuoteRef;
  /** Compact frontispiece: the quote at 22px, high up. */
  compact: boolean;
  /**
   * The panel is always as tall as `tall` (370px). From `short` it sits lower, so only its top 180px show,
   * and it rises when the height changes.
   */
  panelHeight: 'short' | 'tall';
  children: ReactNode;
}

/** The frontispiece on top, one working panel below. The title bar is drawn over the top left by the app. */
export function SetupLayout({ quote, compact, panelHeight, children }: SetupLayoutProps) {
  return (
    <div className={styles.stage} data-compact={compact || undefined}>
      <div className={styles.top}>
        <Frontispiece quote={quote} compact={compact} />
      </div>
      <section className={styles.panel} data-height={panelHeight}>
        {children}
      </section>
    </div>
  );
}
