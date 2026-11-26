import { grow, type Rect } from './placement';
import styles from './Spotlight.module.css';

/** Space between the anchor and the edge of the lit area. */
export const SPOTLIGHT_MARGIN = 8;

export interface SpotlightProps {
  rect: Rect | null;
  reduced: boolean;
}

/** A fixed layer that darkens everything but a rounded box around the anchor. It never takes a click. */
export function Spotlight({ rect, reduced }: SpotlightProps) {
  if (!rect) return null;
  const r = grow(rect, SPOTLIGHT_MARGIN);
  return (
    <div className={styles.layer} data-tour-spotlight="" aria-hidden="true">
      <div
        className={styles.hole}
        data-animated={reduced ? 'false' : 'true'}
        style={{ transform: `translate(${r.x}px, ${r.y}px)`, width: r.width, height: r.height, ...(reduced ? { transition: 'none', animation: 'none' } : null) }}
      />
    </div>
  );
}
