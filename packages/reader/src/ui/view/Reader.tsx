import type { CSSProperties, ReactNode } from 'react';
import { themeVars } from '../../model';
import type { Theme } from '../../model';
import { cx } from './cx';
import type { ReaderLayout } from './useChrome';
import styles from './Reader.module.css';

export interface ReaderProps {
  layout: ReaderLayout;
  theme: Theme;
  /** The bars show. When hidden only the thin line of `progress` stays. */
  chromeVisible: boolean;
  /** 0 to 1, for the thin line. */
  progress: number;
  top: ReactNode;
  bottom: ReactNode;
  /** The page: the frame. */
  children: ReactNode;
  /** Computer: the companion panel, at the right. It pushes the page from 1100 px of width and covers it below. */
  panel?: ReactNode;
  panelOpen?: boolean;
  /** Popovers, sheets and the like. */
  overlays?: ReactNode;
  /** The mouse came to the top or bottom band while the bars are hidden. */
  onReveal?: () => void;
  /** An error state: the bars stay shown, with no bottom bar and no thin line. */
  failed?: boolean;
}

/**
 * The layout. Computer: top bar, page, bottom bar and the panel. The bars keep their rows when
 * hidden, so the page never moves. Phone: the page fills the screen and the bars lie over it.
 */
export function Reader(props: ReaderProps) {
  const { layout, theme, chromeVisible, progress, top, bottom, children, panel, panelOpen = false, overlays, onReveal, failed = false } = props;
  const shown = chromeVisible || failed;
  const style = { ...themeVars(theme), '--rd-progress': String(Math.min(1, Math.max(0, progress))) } as CSSProperties;
  return (
    <div className={styles.root} data-layout={layout} data-theme={theme} data-panel={panelOpen ? 'open' : 'closed'} style={style}>
      <div className={styles.main}>
        <div className={cx(styles.bar, styles.topBar)} data-bar="top" data-visible={shown} inert={!shown}>
          {top}
        </div>
        <div className={styles.page}>{children}</div>
        {failed ? null : (
          <div className={cx(styles.bar, styles.bottomBar)} data-bar="bottom" data-visible={chromeVisible} inert={!chromeVisible}>
            {bottom}
          </div>
        )}
        {failed ? null : <div className={styles.line} data-line data-visible={!chromeVisible} aria-hidden="true" />}
        {!shown && layout === 'desktop' ? (
          <>
            <div className={cx(styles.zone, styles.zoneTop)} data-zone="top" onPointerEnter={onReveal} />
            <div className={cx(styles.zone, styles.zoneBottom)} data-zone="bottom" onPointerEnter={onReveal} />
          </>
        ) : null}
      </div>
      {panelOpen && panel ? <aside className={styles.panel}>{panel}</aside> : null}
      {overlays}
    </div>
  );
}
