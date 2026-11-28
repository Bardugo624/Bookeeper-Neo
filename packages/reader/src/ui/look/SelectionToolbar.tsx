import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@bookeeper/ui/base';
import { useReaderT } from '../../i18n';
import { HIGHLIGHT_COLORS, swatch, type HighlightColor, type Theme } from '../../model';
import type { Rect } from '../../engine/protocol';
import styles from './Look.module.css';

export interface SelectionToolbarProps {
  layout: 'desktop' | 'phone';
  /** The theme of the page, for the dots. */
  theme: Theme;
  /** The selection, in px of the box the toolbar is placed in. */
  rect: Rect;
  /** The size of that box: the toolbar stays inside it. */
  bounds: { width: number; height: number };
  /** The color of the highlight that was tapped; `null` for a fresh selection. */
  current: HighlightColor | null;
  onColor: (color: HighlightColor) => void;
  onNote: () => void;
  onCopy: () => void;
  onSearch: () => void;
  onRemove: () => void;
}

const GAP = 8;
const MARGIN = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the toolbar goes: above the selection on the computer, below on the phone; the other side if it does not fit. */
export function placeToolbar(
  layout: 'desktop' | 'phone',
  rect: Rect,
  bounds: { width: number; height: number },
  size: { width: number; height: number },
): { top: number; left: number; side: 'above' | 'below' } {
  const above = rect.y - GAP - size.height;
  const below = rect.y + rect.height + GAP;
  const fitsAbove = above >= MARGIN;
  const fitsBelow = below + size.height <= bounds.height - MARGIN;
  const side = layout === 'phone' ? (fitsBelow || !fitsAbove ? 'below' : 'above') : fitsAbove || !fitsBelow ? 'above' : 'below';
  const top = clamp(side === 'above' ? above : below, MARGIN, Math.max(MARGIN, bounds.height - size.height - MARGIN));
  const left = clamp(rect.x + rect.width / 2 - size.width / 2, MARGIN, Math.max(MARGIN, bounds.width - size.width - MARGIN));
  return { top, left, side };
}

/**
 * The bar over a selection: four colors, «Nota», «Copia», «Cerca sul web». On an existing highlight the
 * current color is marked (`aria-pressed`) and «Togli» is added.
 */
export function SelectionToolbar({ layout, theme, rect, bounds, current, onColor, onNote, onCopy, onSearch, onRemove }: SelectionToolbarProps) {
  const t = useReaderT();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box && (box.width !== size.width || box.height !== size.height)) setSize({ width: box.width, height: box.height });
  });
  const place = placeToolbar(layout, rect, bounds, size);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t('rlook.selection.label')}
      className={styles.toolbar}
      data-layout={layout}
      data-side={place.side}
      style={{ top: place.top, left: place.left }}
    >
      <div className={styles.dots} role="group" aria-label={t('rlook.selection.label')}>
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={t(`rlook.color.${color}`)}
            aria-pressed={current === null ? undefined : current === color}
            className={styles.dot}
            onClick={() => onColor(color)}
          >
            <span className={styles.swatch} style={{ background: swatch(color, theme) }} />
          </button>
        ))}
      </div>
      <span className={styles.sep} aria-hidden="true" />
      <button type="button" className={styles.action} onClick={onNote}>
        <Icon name="pencil" />
        {t('rlook.selection.note')}
      </button>
      <button type="button" className={styles.action} onClick={onCopy}>
        <Icon name="restore" />
        {t('rlook.selection.copy')}
      </button>
      <button type="button" className={styles.action} onClick={onSearch}>
        <Icon name="search" />
        {t('rlook.selection.search')}
      </button>
      {current ? (
        <button type="button" className={styles.action} onClick={onRemove}>
          <Icon name="trash" />
          {t('rlook.selection.remove')}
        </button>
      ) : null}
    </div>
  );
}
