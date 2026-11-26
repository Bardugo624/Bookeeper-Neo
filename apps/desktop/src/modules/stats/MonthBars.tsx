import { useId } from 'react';
import { useLocale, useT } from '../../app';
import { monthName } from './readingModel';
import styles from './MonthBars.module.css';

const W = 480;
const H = 160;
const TOP = 22;
const BASE = H - 24;
const SLOT = W / 12;

/** Twelve SVG columns with their values, plus the same numbers as a table for assistive technology. */
export function MonthBars({ year, byMonth }: { year: number; byMonth: number[] }) {
  const t = useT();
  const locale = useLocale();
  const headingId = useId();
  const max = Math.max(1, ...byMonth);
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {t('stats.reading.byMonth.title')}
      </h2>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        {byMonth.map((n, i) => {
          const h = (n / max) * (BASE - TOP);
          const x = i * SLOT + SLOT / 2;
          return (
            <g key={i}>
              <rect data-month={i} className={styles.bar} x={i * SLOT + 6} y={BASE - h} width={SLOT - 12} height={h} rx={3} />
              <text className={styles.value} x={x} y={BASE - h - 6} textAnchor="middle">
                {n}
              </text>
              <text className={styles.month} x={x} y={H - 6} textAnchor="middle">
                {monthName(locale, i, 'short')}
              </text>
            </g>
          );
        })}
      </svg>
      <table className={styles.sr}>
        <caption>{t('stats.reading.byMonth.chart', { year })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('stats.reading.byMonth.month')}</th>
            <th scope="col">{t('stats.reading.byMonth.count')}</th>
          </tr>
        </thead>
        <tbody>
          {byMonth.map((n, i) => (
            <tr key={i}>
              <th scope="row">{monthName(locale, i, 'long')}</th>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
