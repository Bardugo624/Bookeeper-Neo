import { useId, useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { FillBar } from '@bookeeper/ui/book';
import { useT } from '../../app';
import type { Row } from './model';
import styles from './DistributionCard.module.css';

export const VISIBLE_ROWS = 10;

export interface DistributionCardProps {
  title: string;
  rows: Row[];
}

/** An accessible table: label, bar (decorative) and count per row. */
export function DistributionCard({ title, rows }: DistributionCardProps) {
  const t = useT();
  const [all, setAll] = useState(false);
  const headingId = useId();
  const shown = all ? rows : rows.slice(0, VISIBLE_ROWS);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      <table className={styles.table}>
        <thead className={styles.sr}>
          <tr>
            <th scope="col">{t('stats.table.label')}</th>
            <th scope="col">{t('stats.table.bar')}</th>
            <th scope="col">{t('stats.table.count')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <th scope="row" className={styles.label}>
                {r.label}
              </th>
              <td className={styles.bar} aria-hidden="true">
                <FillBar value={r.count / max} tone="ok" label={`${r.label}: ${r.count}`} />
              </td>
              <td className={styles.count}>{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > VISIBLE_ROWS ? (
        <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? t('stats.showLess') : t('stats.showAll', { count: rows.length })}
        </Button>
      ) : null}
    </section>
  );
}
