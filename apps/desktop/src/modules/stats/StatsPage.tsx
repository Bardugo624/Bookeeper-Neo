import { useNavigate } from 'react-router';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { StatCard } from '@bookeeper/ui/book';
import { useT } from '../../app';
import { PageHeader } from '../../kit';
import { DistributionCard } from './DistributionCard';
import { DISTRIBUTIONS, TOTALS, toRows, type Overview } from './model';
import { ShelfFillCard } from './ShelfFillCard';
import { useStats } from './useStats';
import styles from './StatsPage.module.css';

export function StatsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useStats();

  let body;
  if (isPending) {
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
              decadeLabel: (decade) => t('stats.decade', { decade }),
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
      {body}
    </div>
  );
}
