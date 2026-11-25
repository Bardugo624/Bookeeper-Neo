import { PillTabs, type PillTabItem } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { SearchField } from './SearchField';
import type { ListParams, ViewMode } from './listParams';
import styles from './BooksHeader.module.css';

export interface BooksHeaderProps {
  params: ListParams;
  total: number | undefined;
  onLoan: number | undefined;
}

export function BooksHeader({ params, total, onLoan }: BooksHeaderProps) {
  const t = useT();
  const views: PillTabItem[] = [
    { id: 'grid', label: t('books.view.grid'), icon: 'grid', iconOnly: true },
    { id: 'list', label: t('books.view.list'), icon: 'list', iconOnly: true },
  ];
  const parts = [
    total === undefined ? null : t('books.count', { count: total }),
    onLoan === undefined ? null : t('books.onLoan', { count: onLoan }),
  ].filter(Boolean);
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{t('books.title')}</h1>
        <p className={styles.count}>{parts.join(' · ')}</p>
      </div>
      <div className={styles.tools}>
        <SearchField value={params.q} onCommit={params.setQuery} />
        <PillTabs
          items={views}
          value={params.view}
          onChange={(id) => params.setView(id as ViewMode)}
          variant="segmented"
          size="sm"
          label={t('books.view.label')}
        />
      </div>
    </header>
  );
}
