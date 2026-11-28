import type { ReactElement, ReactNode } from 'react';
import { Menu, type MenuEntry } from '@bookeeper/ui/overlays';
import { useReaderT } from '../../i18n';
import { BarButton } from './BarButton';
import { AaIcon, BackIcon, BookmarkIcon, MoreIcon, PanelIcon, SearchIcon } from './icons';
import type { ReaderLayout } from './useChrome';
import styles from './Bars.module.css';

export interface TopBarProps {
  layout: ReaderLayout;
  title: string;
  chapter?: string | null;
  onBack: () => void;
  onSearch: () => void;
  onBookmark: () => void;
  bookmarked: boolean;
  onAppearance: () => void;
  /** Computer: wraps the Aa button in the popover that hangs from it. It then opens and closes the popover itself. */
  anchorAppearance?: (button: ReactElement) => ReactNode;
  onPanel: () => void;
  panelOpen: boolean;
  /** Phone: the items of «⋯». */
  moreItems?: MenuEntry[];
  /** After the buttons: the window's own controls (computer). */
  topEnd?: ReactNode;
  /** An error state: only «Indietro» and the title. */
  bare?: boolean;
}

export function TopBar(props: TopBarProps) {
  const { layout, title, chapter, onBack, onSearch, onBookmark, bookmarked, onAppearance, anchorAppearance, onPanel, panelOpen, moreItems, topEnd, bare = false } = props;
  const t = useReaderT();
  const desktop = layout === 'desktop';
  // `data-tauri-drag-region` counts for the element that carries it only, so the buttons stay clickable.
  const drag = desktop ? { 'data-tauri-drag-region': '' } : {};
  const bookmarkLabel = bookmarked ? t('reader.top.bookmark_remove') : t('reader.top.bookmark');

  return (
    <header className={styles.top} data-layout={layout} {...drag}>
      <div className={styles.back}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label={desktop ? undefined : t('reader.top.back')}>
          <BackIcon />
          {desktop ? <span>{t('reader.top.back')}</span> : null}
        </button>
      </div>
      <div className={styles.title} {...drag}>
        <span className={styles.name} {...drag}>{title}</span>
        {desktop && chapter ? <span className={styles.chapter} {...drag}>{' · '}{chapter}</span> : null}
      </div>
      {bare ? <div className={styles.actions} /> : <div className={styles.actions}>
        {desktop ? (
          <>
            <BarButton tip icon={<SearchIcon />} label={t('reader.top.search')} onClick={onSearch} />
            <BarButton tip icon={<BookmarkIcon filled={bookmarked} />} label={bookmarkLabel} onClick={onBookmark} />
          </>
        ) : null}
        {desktop && anchorAppearance ? (
          anchorAppearance(<BarButton tip icon={<AaIcon />} label={t('reader.top.appearance')} aria-haspopup="dialog" />)
        ) : (
          <BarButton tip={desktop} icon={<AaIcon />} label={t('reader.top.appearance')} aria-haspopup="dialog" onClick={onAppearance} />
        )}
        {desktop ? (
          <BarButton
            tip
            icon={<PanelIcon />}
            label={t('reader.top.panel')}
            active={panelOpen}
            aria-expanded={panelOpen}
            onClick={onPanel}
          />
        ) : moreItems?.length ? (
          <Menu items={moreItems} trigger={<BarButton icon={<MoreIcon />} label={t('reader.top.more')} />} />
        ) : null}
      </div>}
      {desktop ? <div className={styles.end} data-slot="top-end">{topEnd}</div> : null}
    </header>
  );
}
