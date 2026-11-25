import { useMemo, useState } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { Input } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app';
import { LoanList } from './LoanList';
import type { LoanActions } from './LoanCard';
import { groupByMonth, lateDays, durationDays, matchesText, summarize } from './history';
import styles from './LoanHistory.module.css';

export interface LoanHistoryProps {
  loans: LoanOut[];
  actions?: LoanActions;
  busyId?: string;
  onBorrower(name: string): void;
}

/** Returned loans: summary, search and one list per month of return. */
export function LoanHistory({ loans, actions, busyId, onBorrower }: LoanHistoryProps) {
  const t = useT();
  const locale = useLocale();
  const [text, setText] = useState('');
  const summary = useMemo(() => summarize(loans), [loans]);
  const groups = useMemo(() => groupByMonth(loans.filter((l) => matchesText(l, text))), [loans, text]);
  const extras = useMemo(() => {
    const out: Record<string, string> = {};
    for (const l of loans) {
      const late = lateDays(l);
      const parts = [t('loans.history.duration', { count: durationDays(l) })];
      if (late > 0) parts.push(t('loans.history.late', { count: late }));
      out[l.id] = parts.join(' · ');
    }
    return out;
  }, [loans, t]);
  const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });

  return (
    <div className={styles.history}>
      <dl className={styles.summary} aria-label={t('loans.history.summary')}>
        <div>
          <dt>{t('loans.history.closed')}</dt>
          <dd>{summary.closed}</dd>
        </div>
        <div>
          <dt>{t('loans.history.average')}</dt>
          <dd>{summary.averageDays === null ? '–' : t('loans.history.days', { count: summary.averageDays })}</dd>
        </div>
        <div>
          <dt>{t('loans.history.top')}</dt>
          <dd>
            {summary.topBorrower
              ? t('loans.history.topValue', { name: summary.topBorrower.name, count: summary.topBorrower.count })
              : '–'}
          </dd>
        </div>
      </dl>
      <Input
        type="search"
        role="searchbox"
        aria-label={t('loans.history.search')}
        placeholder={t('loans.history.search')}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {groups.length === 0 ? <p className={styles.none}>{t('loans.history.noMatch')}</p> : null}
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`loan-month-${g.key}`} className={styles.group}>
          <h2 id={`loan-month-${g.key}`} className={styles.month}>
            {month.format(new Date(g.at * 1000))}
          </h2>
          <LoanList
            loans={g.loans}
            label={t('loans.history.monthList', { month: month.format(new Date(g.at * 1000)) })}
            actions={actions}
            busyId={busyId}
            onBorrower={onBorrower}
            extras={extras}
          />
        </section>
      ))}
    </div>
  );
}
