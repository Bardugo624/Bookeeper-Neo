import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Bookmarks } from './Bookmarks';
import styles from './CoachCard.module.css';
import type { TourNote, TourStep } from './model';
import { grow, placeBesidePanel, placeCard, type Rect } from './placement';
import { SPOTLIGHT_MARGIN } from './Spotlight';
import { CARD_ATTR } from './usePauseTriggers';
import type { Target } from './useTarget';

/** How long the closing card stays when nobody clicks it away. */
export const FINALE_MS = 6000;
const CARD_WIDTH = 320;

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

  // The closing card goes away by itself; reduced motion changes nothing here, there is no animation.
  const later = useRef(onLater);
  later.current = onLater;
  useEffect(() => {
    if (!closing) return;
    const id = setTimeout(() => later.current(), FINALE_MS);
    return () => clearTimeout(id);
  }, [closing]);

  // Measured after every render; the state only moves when the box does.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = { width: el.offsetWidth, height: el.offsetHeight };
    if (next.width !== size.width || next.height !== size.height) setSize(next);
  });

  const lit: Rect | null = target.rect ? grow(target.rect, SPOTLIGHT_MARGIN) : null;
  const view = { width: window.innerWidth, height: window.innerHeight };
  // Inside a dialog (which may move with a transform) coordinates are relative to it.
  const origin = host ? host.getBoundingClientRect() : null;
  // Beside the dialog's panel, never over its controls.
  const slot = host?.querySelector<HTMLElement>('[data-tour-slot]') ?? null;
  const preferred = { width: Math.min(CARD_WIDTH, view.width - 24), height: size.height };
  let place =
    lit && origin
      ? placeBesidePanel(lit, { x: origin.left, y: origin.top, width: origin.width, height: origin.height }, preferred, view)
      : placeCard(lit, size, view);
  // No room beside the panel and nowhere in the dialog's flow to sit: against the anchor, as a last resort.
  if (place.side === 'inline' && !slot && lit) place = placeCard(lit, size, view);
  const inline = place.side === 'inline';
  // In the dialog's flow the card can sit below the fold of the scrolling body: bring it into view.
  const inSlot = inline && !!slot;
  useEffect(() => {
    if (inSlot) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [inSlot, index, closing]);
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
      data-inline={inline ? '' : undefined}
      style={
        inline
          ? undefined
          : {
              left: x,
              top: y,
              width: place.width,
              ['--tour-arrow' as string]: `${place.arrow}px`,
            }
      }
    >
      {place.side !== 'none' && !inline ? <span className={styles.arrow} data-vertical={vertical ? '' : undefined} aria-hidden="true" /> : null}
      {lead ? <p className={styles.note}>{t(lead.textKey, lead.params)}</p> : null}
      {closing ? (
        <div className={styles.progress}>
          <Bookmarks total={total} current={total} />
        </div>
      ) : (
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
  return host ? createPortal(card, inline && slot ? slot : host) : card;
}
