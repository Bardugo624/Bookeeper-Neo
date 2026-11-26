import { useState } from 'react';
import { Link } from 'react-router';
import { Button, EmptyState, Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { ErrorState, Screen, apiErrorMessage } from '../../kit';
import { ResultList, ResultSkeletons } from './ResultList';
import { ActiveFilters } from './ActiveFilters';
import { FilterBar } from './FilterBar';
import { FilterSheet } from './FilterSheet';
import { SearchField } from './SearchField';
import { countSheet, useSearchState } from './searchState';
import { useBookSearch } from './useBookSearch';
import styles from './SearchPage.module.css';

export function SearchPage() {
  const t = useT();
  const state = useSearchState();
  const result = useBookSearch(state);
  const q = state.q.trim();
  const [sheetOpen, setSheetOpen] = useState(false);
  const filterCount = countSheet(state);
  const filtered = state.filter !== 'all' || filterCount > 0;
  const filtering = q !== '' || filtered;
  const count = result.status === 'ready' && result.total !== undefined && !result.stale ? result.total : null;

  let body;
  if (result.status === 'pending') body = <ResultSkeletons />;
  else if (result.status === 'error') {
    body = <ErrorState message={apiErrorMessage(t, result.error)} onRetry={result.refetch} />;
  } else if (result.items.length === 0) {
    body = filtering ? (
      <EmptyState
        icon="search"
        title={t('msearch.none.title')}
        text={filtered ? t('msearch.none.filtered') : q ? t('msearch.none.textFor', { q }) : t('msearch.none.text')}
        action={
          filtered ? (
            <Button variant="secondary" onClick={state.resetAll}>
              {t('msearch.none.reset')}
            </Button>
          ) : undefined
        }
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
        nextFailed={result.nextFailed}
        onEnd={result.fetchNextPage}
      />
    );
  }

  return (
    <Screen
      title={t('msearch.title')}
      actions={
        <Link to="/shelves" className={styles.shelves}>
          <Icon name="library" size={18} />
          {t('msearch.shelves')}
        </Link>
      }
    >
      <div className={styles.top}>
        <SearchField value={state.q} onCommit={state.setQuery} />
        <div className={styles.filters}>
          <FilterBar
            state={state}
            onFilter={state.setFilter}
            onAll={state.showAll}
            onReading={(reading) => state.setSheet({ reading, tags: state.tags, room: state.room })}
          />
          <button type="button" className={styles.open} onClick={() => setSheetOpen(true)}>
            <Icon name="filter" size={18} />
            {t('msearch.sheet.open')}
            {filterCount > 0 ? <span className={styles.badge}>{filterCount}</span> : null}
          </button>
        </div>
        <ActiveFilters state={state} />
        <p className={styles.count} aria-live="polite">
          {count !== null
            ? q === '' && !filtered
              ? `${t('msearch.list.recent')} · ${t('msearch.list.count', { count })}`
              : t('msearch.list.count', { count })
            : ''}
        </p>
      </div>
      {body}
      {sheetOpen ? (
        <FilterSheet
          applied={state}
          onClose={() => setSheetOpen(false)}
          onApply={(next) => {
            state.setSheet(next);
            setSheetOpen(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
