import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { StatCard } from '@bookeeper/ui/book';
import { Select } from '@bookeeper/ui/overlays';
import { useLocale, useT } from '../../app';
import { DistributionCard } from './DistributionCard';
import { toRows } from './model';
import { MonthBars } from './MonthBars';
import { ReadingCalendar } from './ReadingCalendar';
import { yearOptions } from './readingModel';
import { useReadingStats } from './useReadingStats';
import { YearDialog } from './YearDialog';
import styles from './ReadingTab.module.css';

/** `year` 0: the server's current year. */
export function ReadingTab({ year, onYear }: { year: number; onYear: (year: number) => void }) {
  const t = useT();
  const locale = useLocale();
  const navigate = useNavigate();
  const [posterOpen, setPosterOpen] = useState(false);
  const { data, isPending, isError, refetch } = useReadingStats(year || undefined);

  if (isPending) {
    return (
      <div role="status" aria-label={t('stats.reading.loading')} className={styles.stack}>
        <div className={styles.cards}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={84} />
          ))}
        </div>
        <Skeleton height={200} />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title={t('stats.reading.error.title')}
        text={t('stats.reading.error.text')}
        action={<Button onClick={() => void refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  const y = data.year;
  const options = yearOptions(data.years, y.year).map((n) => ({ value: String(n), label: String(n) }));
  const genres = toRows(
    y.by_genre.map((g) => ({ key: g.value ?? '', count: g.count })),
    { missing: t('stats.missing'), others: t('stats.others'), decadeLabel: String },
  );
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <div className={styles.year}>
          <Select aria-label={t('stats.reading.yearLabel')} options={options} value={String(y.year)} onValueChange={(v) => onYear(Number(v))} />
        </div>
        {y.books > 0 ? (
          <Button variant="primary" onClick={() => setPosterOpen(true)}>
            {t('stats.poster.open')}
          </Button>
        ) : null}
      </div>
      {y.books === 0 ? (
        <EmptyState
          icon="book"
          title={t('stats.reading.empty.title', { year: y.year })}
          text={t('stats.reading.empty.text')}
          action={
            <Button variant="primary" onClick={() => void navigate('/books')}>
              {t('stats.reading.empty.action')}
            </Button>
          }
        />
      ) : (
        <>
          <div className={styles.cards}>
            <StatCard label={t('stats.reading.cards.books')} value={y.books} glyph="book" tone="primary" />
            <StatCard label={t('stats.reading.cards.pages')} value={y.pages} glyph="list" tone="neutral" />
            <StatCard
              label={t('stats.reading.cards.rating')}
              value={y.rated.average == null ? t('stats.reading.cards.noRating') : y.rated.average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              glyph="check"
              tone="ok"
            />
          </div>
          <MonthBars year={y.year} byMonth={y.by_month} />
          <ReadingCalendar year={y.year} days={y.days} />
          <div className={styles.cards2}>
            {genres.length > 0 ? <DistributionCard title={t('stats.reading.genres')} rows={genres} /> : null}
            {y.longest ? (
              <section className={styles.longest}>
                <h2 className={styles.heading}>{t('stats.reading.longest')}</h2>
                <Link to={`/books/${y.longest.book_id}`}>{y.longest.title}</Link>
                <p className={styles.muted}>{t('stats.reading.longestPages', { count: y.longest.page_count })}</p>
              </section>
            ) : null}
          </div>
          <YearDialog year={y} open={posterOpen} onClose={() => setPosterOpen(false)} />
        </>
      )}
    </div>
  );
}
