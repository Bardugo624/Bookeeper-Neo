import type { AuditOut } from '@bookeeper/api';
import { EmptyState } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../../../app/i18n';
import { DataTable, formatRelativeDays, type Column } from '../../../../kit';
import { AuditWhat } from './AuditWhat';
import styles from './AuditSection.module.css';

export function AuditTable({ items }: { items: AuditOut[] }) {
  const t = useT();
  const locale = useLocale();
  const stamp = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const columns: Column<AuditOut>[] = [
    {
      id: 'when',
      header: t('audit.columns.when'),
      width: '11rem',
      cell: (e) => (
        <time dateTime={new Date(e.at * 1000).toISOString()} title={formatRelativeDays(locale, e.at)}>
          {stamp.format(new Date(e.at * 1000))}
        </time>
      ),
    },
    {
      id: 'who',
      header: t('audit.columns.who'),
      width: '12rem',
      cell: (e) => (e.user ? e.user.display_name : <span className={styles.muted}>{t('audit.system')}</span>),
    },
    { id: 'device', header: t('audit.columns.device'), width: '12rem', cell: (e) => e.device?.name ?? '' },
    { id: 'what', header: t('audit.columns.what'), cell: (e) => <AuditWhat entry={e} /> },
  ];

  return (
    <div className={styles.wide}>
    <DataTable
      label={t('audit.table')}
      columns={columns}
      rows={items}
      rowKey={(e) => String(e.id)}
      empty={<EmptyState title={t('audit.empty.title')} text={t('audit.empty.description')} />}
    />
    </div>
  );
}
