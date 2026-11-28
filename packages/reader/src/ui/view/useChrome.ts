import { useCallback, useState } from 'react';

export type ReaderLayout = 'desktop' | 'phone';
/** The bands where the mouse brings the controls back (computer), in px. */
export const EDGE_TOP = 64;
export const EDGE_BOTTOM = 72;

export interface ChromeOptions {
  layout: ReaderLayout;
  /** A question or a popover is open: the controls stay. */
  hold: boolean;
}

/**
 * Whether the bars show. Visible on opening, hidden at the first turn, back with Esc, with the mouse
 * in the top or bottom band (computer) or with a tap in the centre (phone).
 */
export function useChrome({ layout, hold }: ChromeOptions) {
  const [shown, setShown] = useState(true);
  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => setShown(false), []);
  const toggle = useCallback(() => setShown((s) => !s), []);
  /** `clientY` and `height` in the same box, for a pointer that moves over the reader itself. */
  const onPointerMove = useCallback(
    (clientY: number, height: number) => {
      if (layout !== 'desktop') return;
      if (clientY <= EDGE_TOP || clientY >= height - EDGE_BOTTOM) setShown(true);
    },
    [layout],
  );
  const onTap = useCallback(
    (zone: 'start' | 'center' | 'end') => {
      if (layout === 'phone' && zone === 'center') setShown((s) => !s);
    },
    [layout],
  );
  return { visible: shown || hold, show, hide, toggle, onPointerMove, onTap };
}
