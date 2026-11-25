import { EmptyState } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { ResultList, ResultSkeletons } from './ResultList';
import { SearchField } from './SearchField';
import { FILTERS, useSearchState, type Filter } from './searchState';
import { useBookSearch } from './useBookSearch';
import styles from './SearchPage.module.css';

export function SearchPage() {
  const t = useT();
  const state = useSearchState();
  const result = useBookSearch(state);
  const q = state.q.trim();
  const filtering = q !== '' || state.filter !== 'all';
  const count = result.status === 'ready' && result.total !== undefined && !result.stale ? result.total : null;

  const items = FILTERS.map((id) => ({ id, label: t(`msearch.filters.${id}`) }));

  let body;
  if (result.status === 'pending') body = <ResultSkeletons />;
  else if (result.status === 'error') {
    body = <ErrorState message={apiErrorMessage(t, result.error)} onRetry={result.refetch} />;
  } else if (result.items.length === 0) {
    body = filtering ? (
      <EmptyState
        icon="search"
        title={t('msearch.none.title')}
        text={q ? t('msearch.none.textFor', { q }) : t('msearch.none.text')}
      />
    ) : (
      <EmptyState icon="library" title={t('msearch.empty.title')} text={t('msearch.empty.text')} />
    );
  } else {
    body = (
      <ResultList
        items={result.items}
        from={state.search}
        busy={result.stale}
        hasNext={result.hasNextPage}
        fetchingNext={result.fetchingNext}
        onEnd={result.fetchNextPage}
      />
    );
  }

  return (
    <Screen title={t('msearch.title')}>
      <div className={styles.top}>
        <SearchField value={state.q} onCommit={state.setQuery} />
        <div className={styles.filters}>
          <PillTabs
            items={items}
            value={state.filter}
            onChange={(id) => state.setFilter(id as Filter)}
            label={t('msearch.filters.label')}
          />
        </div>
        <p className={styles.count} aria-live="polite">
          {count !== null
            ? q === '' && state.filter === 'all'
              ? `${t('msearch.list.recent')} · ${t('msearch.list.count', { count })}`
              : t('msearch.list.count', { count })
            : ''}
        </p>
      </div>
      {body}
    </Screen>
  );
}
