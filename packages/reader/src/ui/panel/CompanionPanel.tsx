import { PillTabs } from '@bookeeper/ui/overlays';
import { useReaderT } from '../../i18n';
import { Sheet } from '../view/Sheet';
import { NotesList, type NotesListProps } from './NotesList';
import { SearchTab, type SearchTabProps } from './SearchTab';
import { TocList, type TocListProps } from './TocList';
import { PANEL_TABS, type PanelTab } from './types';
import styles from './CompanionPanel.module.css';

export interface CompanionPanelProps {
  /** `aside`: 360 px on the computer. `sheet`: the phone's sheet from the bottom. */
  variant: 'aside' | 'sheet';
  open: boolean;
  onClose: () => void;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  toc: TocListProps;
  notes: NotesListProps;
  search: SearchTabProps;
}

/** The companion panel: Indice, Note and Cerca. */
export function CompanionPanel({ variant, open, onClose, tab, onTab, toc, notes, search }: CompanionPanelProps) {
  const t = useReaderT();
  if (!open) return null;

  const body = (
    <div className={styles.body} data-variant={variant}>
      <div className={styles.tabs}>
        <PillTabs
          variant="segmented"
          label={t('rpanel.tabs.label')}
          value={tab}
          onChange={(id) => onTab(id as PanelTab)}
          items={PANEL_TABS.map((id) => ({ id, label: t(`rpanel.tabs.${id}`) }))}
        />
      </div>
      <div role="tabpanel" aria-label={t(`rpanel.tabs.${tab}`)} className={styles.pane}>
        {tab === 'toc' ? <TocList {...toc} /> : null}
        {tab === 'notes' ? <NotesList {...notes} /> : null}
        {tab === 'search' ? <SearchTab {...search} /> : null}
      </div>
    </div>
  );

  if (variant === 'sheet') {
    return (
      <Sheet open onOpenChange={(o) => !o && onClose()} title={t('rpanel.title')}>
        {body}
      </Sheet>
    );
  }
  return (
    <aside className={styles.aside} aria-label={t('rpanel.title')}>
      {body}
    </aside>
  );
}
