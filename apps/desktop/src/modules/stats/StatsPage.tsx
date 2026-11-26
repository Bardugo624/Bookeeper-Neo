import { useNavigate } from 'react-router';
import { PillTabs } from '@bookeeper/ui/overlays';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { StatCard } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { PageHeader, intParam, oneOfParam, useListParams } from '../../kit';
import { DistributionCard } from './DistributionCard';
import { DISTRIBUTIONS, FORMAT_CODES, LANGUAGE_CODES, TOTALS, toRows, type Overview } from './model';
import { ReadingTab } from './ReadingTab';
import { ShelfFillCard } from './ShelfFillCard';
import { useStats } from './useStats';
import styles from './StatsPage.module.css';

const TABS = ['library', 'reading'] as const;
/** Tab and year live in the address: `?tab=reading&year=2024`. Year 0: the current one. */
const SCHEMA = { tab: oneOfParam(TABS, 'library'), year: intParam(0) };

export function StatsPage() {
  const t = useT();
  const { values, set } = useListParams(SCHEMA);
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useStats(values.tab === 'library');

  let body;
  if (values.tab === 'reading') {
    body = <ReadingTab year={values.year} onYear={(year) => set({ year })} />;
  } else if (isPending) {
    body = (
      <div role="status" aria-label={t('stats.loading')} className={styles.stack}>
        <div className={styles.totals}>
          {Object.keys(TOTALS).map((k) => (
            <Skeleton key={k} height={84} />
          ))}
        </div>
        <div className={styles.cards}>
          {DISTRIBUTIONS.map((d) => (
            <Skeleton key={d.key} height={220} />
          ))}
        </div>
      </div>
    );
  } else if (isError) {
    body = (
      <EmptyState
        icon="alert"
        title={t('stats.error.title')}
        text={t('stats.error.text')}
        action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
      />
    );
  } else if (data.overview.total_books === 0) {
    body = (
      <EmptyState
        icon="chart"
        title={t('stats.empty.title')}
        text={t('stats.empty.text')}
        action={
          <Button variant="primary" onClick={() => void navigate('/books')}>
            {t('stats.empty.action')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className={styles.stack}>
        <div className={styles.totals}>
          {(Object.keys(TOTALS) as (keyof Overview)[]).map((k) => (
            <StatCard key={k} label={t(`stats.totals.${k}`)} value={data.overview[k]} glyph={TOTALS[k].glyph} tone={TOTALS[k].tone} />
          ))}
        </div>
        <div className={styles.cards}>
          {DISTRIBUTIONS.map((d) => {
            const rows = toRows(data[d.key], {
              chronological: d.chronological,
              decade: d.key === 'by_decade',
              missing: t('stats.missing'),
              others: t('stats.others'),
              normalizeKey: d.key === 'by_format' || d.key === 'by_language',
              decadeLabel: (decade) => t('stats.decade', { decade }),
              keyLabel: (key) => {
                if (d.key === 'by_format' && FORMAT_CODES.includes(key)) return t(`stats.formatLabel.${key}`);
                if (d.key === 'by_language' && LANGUAGE_CODES.includes(key)) return t(`stats.langLabel.${key}`);
                return undefined;
              },
            });
            return rows.length > 0 ? <DistributionCard key={d.key} title={t(`stats.${d.key}`)} rows={rows} /> : null;
          })}
          {data.shelf_fill.length > 0 ? <ShelfFillCard shelves={data.shelf_fill} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={t('stats.title')} />
      <PillTabs
        label={t('stats.tabs.label')}
        value={values.tab}
        onChange={(tab) => set({ tab: tab as (typeof TABS)[number] })}
        items={TABS.map((id) => ({ id, label: t(`stats.tabs.${id}`) }))}
      />
      {body}
    </div>
  );
}
