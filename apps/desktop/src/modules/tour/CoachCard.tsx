import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Bookmarks } from './Bookmarks';
import styles from './CoachCard.module.css';
import type { TourNote, TourStep } from './model';
import { grow, placeCard, type Rect } from './placement';
import { SPOTLIGHT_MARGIN } from './Spotlight';
import { CARD_ATTR } from './usePauseTriggers';
import type { Target } from './useTarget';

export interface CoachCardProps {
  step: TourStep;
  /** Zero-based. */
  index: number;
  total: number;
  target: Target;
  onLater(): void;
  onSkip(): void;
  /** Said once on top of the step, or alone when `closing` (the path is over). */
  note?: TourNote | null;
  closing?: boolean;
}

/**
 * The card of the step: what to do, where we are, and the two ways out. A region, not a dialog.
 * When the anchor sits inside an open dialog the card is drawn inside it, so it stays usable.
 */
export function CoachCard({ step, index, total, target, onLater, onSkip, note, closing = false }: CoachCardProps) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const host = target.el?.closest('[role="dialog"]') ?? null;

  // Measured after every render; the state only moves when the box does.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = { width: el.offsetWidth, height: el.offsetHeight };
    if (next.width !== size.width || next.height !== size.height) setSize(next);
  });

  const lit: Rect | null = target.rect ? grow(target.rect, SPOTLIGHT_MARGIN) : null;
  const place = placeCard(lit, size, { width: window.innerWidth, height: window.innerHeight });
  // Inside a dialog (which may move with a transform) coordinates are relative to it.
  const origin = host ? host.getBoundingClientRect() : null;
  const x = place.x - (origin?.left ?? 0);
  const y = place.y - (origin?.top ?? 0);
  const lead = closing ? null : note;
  const shown = closing && note ? { ...step, ...note } : step;
  const title = t(shown.titleKey, shown.params);
  const vertical = place.side === 'top' || place.side === 'bottom';

  const card = (
    <section
      ref={ref}
      role="region"
      aria-labelledby="tour-card-title"
      {...{ [CARD_ATTR]: '' }}
      className={styles.card}
      data-side={place.side}
      data-hosted={host ? '' : undefined}
      style={{
        left: x,
        top: y,
        ['--tour-arrow' as string]: `${place.arrow}px`,
      }}
    >
      {place.side !== 'none' ? <span className={styles.arrow} data-vertical={vertical ? '' : undefined} aria-hidden="true" /> : null}
      {lead ? <p className={styles.note}>{t(lead.textKey, lead.params)}</p> : null}
      {closing ? null : (
        <div className={styles.progress}>
          <Bookmarks total={total} current={index} />
          <span className={styles.count}>{t('tour.card.step', { n: index + 1, total })}</span>
        </div>
      )}
      <h2 id="tour-card-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.text}>{t(shown.textKey, shown.params)}</p>
      <div className={styles.actions}>
        {closing ? (
          <Button variant="secondary" size="sm" onClick={onLater}>
            {t('tour.gotIt')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onLater}>
              {t('tour.later')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip}>
              {t('tour.skip')}
            </Button>
          </>
        )}
      </div>
      <div className={styles.sr} aria-live="polite" role="status">
        {closing ? title : t('tour.card.announce', { n: index + 1, total, title })}
      </div>
    </section>
  );
  return host ? createPortal(card, host) : card;
}
