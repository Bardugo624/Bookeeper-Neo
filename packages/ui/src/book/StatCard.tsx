import type { ReactNode } from 'react';
import { Icon, type IconName } from '../base/Icon';
import { cx } from '../base/cx';
import { useCountUp } from './useCountUp';
import styles from './StatCard.module.css';

export interface StatCardProps {
  label: string;
  value: number | string;
  glyph?: IconName;
  tone?: 'neutral' | 'primary' | 'ok' | 'warn' | 'danger';
}

function Counted({ value }: { value: number }): ReactNode {
  const shown = useCountUp(value);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className={styles.sr}>{value}</span>
    </>
  );
}

export function StatCard({ label, value, glyph, tone = 'primary' }: StatCardProps) {
  return (
    <div className={styles.card}>
      <div className={cx(styles.label, styles[tone])}>
        {glyph ? <Icon name={glyph} size={14} /> : null}
        <span>{label}</span>
      </div>
      <div className={styles.value}>{typeof value === 'number' ? <Counted value={value} /> : value}</div>
    </div>
  );
}
