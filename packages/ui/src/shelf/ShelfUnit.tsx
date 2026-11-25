import { useRef } from 'react';
import { TooltipProvider } from '../overlays';
import { shelfVars } from './colors';
import { ShelfBand } from './ShelfBand';
import { useKeyboardMove } from './useKeyboardMove';
import type { ShelfAnnounce, ShelfRow, SlotDrop, SpineBook, SpineLabel } from './types';
import styles from './Shelf.module.css';

export interface ShelfUnitProps {
  /** Cabinet color (see `SHELF_COLORS`). */
  color: string;
  rows: ShelfRow[];
  /** Tooltip texts for a spine; the component writes none. */
  spineLabel: (book: SpineBook) => SpineLabel;
  /** Live-region texts for the keyboard move. */
  announce?: ShelfAnnounce;
  onSpineClick?: (book: SpineBook) => void;
  onSlotDrop?: (drop: SlotDrop) => void;
  selectedId?: string;
  /** Draws the dashed insertion slot, e.g. while something outside the unit is dragged over it. */
  dropTarget?: { rowId: string; index: number } | null;
}

/** A cabinet: frame, darkened back panel and one band per shelf, with drag and keyboard moves. */
export function ShelfUnit(props: ShelfUnitProps) {
  const { rows, dropTarget } = props;
  const root = useRef<HTMLDivElement>(null);
  const kb = useKeyboardMove(rows, props.onSlotDrop, props.announce, root);

  const externalIndex = (rowId: string) => {
    if (kb.marker?.rowId === rowId) return kb.marker.index;
    return dropTarget?.rowId === rowId ? dropTarget.index : null;
  };

  return (
    <TooltipProvider>
      <div ref={root} className={styles.unit} style={shelfVars(props.color)}>
        <div className={styles.back}>
          {rows.map((row, rowIndex) => (
            <ShelfBand
              key={row.id}
              row={row}
              rowIndex={rowIndex}
              spineLabel={props.spineLabel}
              selectedId={props.selectedId}
              pickedId={kb.picked}
              externalIndex={externalIndex(row.id)}
              onSpineClick={props.onSpineClick}
              onSlotDrop={props.onSlotDrop}
              onKeyDown={kb.onKeyDown}
              onKeyUp={kb.onKeyUp}
              onBlur={kb.cancel}
            />
          ))}
        </div>
        <div className={styles.live} role="status" aria-live="polite">
          {kb.message}
        </div>
      </div>
    </TooltipProvider>
  );
}
