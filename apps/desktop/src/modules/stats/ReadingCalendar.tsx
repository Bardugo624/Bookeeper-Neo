import { useMemo } from 'react';
import { useLocale, useT } from '../../app';
import { dateFormatter, yearCells } from './readingModel';
import styles from './ReadingCalendar.module.css';

/** Heat map of the year: one cell per day, weeks as columns, Monday on the first row. */
export function ReadingCalendar({ year, days }: { year: number; days: { date: string; books: number }[] }) {
  const t = useT();
  const locale = useLocale();
  const cells = useMemo(() => yearCells(year, days), [year, days]);
  const format = useMemo(() => dateFormatter(locale, { dateStyle: 'long' }), [locale]);
  return (
    <section className={styles.card} aria-labelledby="reading-calendar-title">
      <h2 id="reading-calendar-title" className={styles.title}>
        {t('stats.reading.calendar.title')}
      </h2>
      <div className={styles.scroll}>
        <div className={styles.grid} role="group" aria-label={t('stats.reading.calendar.label', { year })}>
          {cells.map((c, i) => {
            const label = t('stats.reading.calendar.cell', { count: c.books, date: format.format(new Date(`${c.date}T00:00:00Z`)) });
            return (
              <span
                key={c.date}
                role="img"
                aria-label={label}
                title={label}
                data-level={c.level}
                className={styles.cell}
                style={i === 0 ? { gridRowStart: c.weekday + 1 } : undefined}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
