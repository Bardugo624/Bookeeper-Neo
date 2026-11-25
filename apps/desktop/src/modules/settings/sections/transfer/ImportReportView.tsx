import { Link } from 'react-router';
import type { ImportReport, ImportRowError } from '@bookeeper/api';
import { Button, Tag } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { DataTable, type Column } from '../../../../kit';
import { MAX_VISIBLE_ERRORS } from './transferModel';
import styles from './TransferSection.module.css';

export interface ImportReportViewProps {
  report: ImportReport;
  onDownload(): void;
}

/** What an import did: three counts, the rows that failed, and a way on. */
export function ImportReportView({ report, onDownload }: ImportReportViewProps) {
  const t = useT();
  const shown = report.errors.slice(0, MAX_VISIBLE_ERRORS);
  const columns: Column<ImportRowError>[] = [
    { id: 'row', header: t('transfer.report.row'), cell: (e) => e.row, width: '90px' },
    { id: 'message', header: t('transfer.report.reason'), cell: (e) => e.message },
  ];

  return (
    <div className={styles.report} aria-label={t('transfer.report.title')} role="group">
      <ul className={styles.counts}>
        <li>
          <Tag tone="ok">{t('transfer.report.imported', { count: report.new })}</Tag>
        </li>
        <li>
          <Tag tone="neutral">{t('transfer.report.duplicates', { count: report.duplicates })}</Tag>
        </li>
        <li>
          <Tag tone={report.invalid > 0 ? 'danger' : 'neutral'}>{t('transfer.report.invalid', { count: report.invalid })}</Tag>
        </li>
      </ul>
      {shown.length > 0 ? (
        <>
          <h3 className={styles.errorsTitle}>{t('transfer.report.errorsTitle')}</h3>
          <div className={styles.errorsScroll}>
            <DataTable label={t('transfer.report.errorsTable')} columns={columns} rows={shown} rowKey={(e) => `${e.row}:${e.message}`} />
          </div>
          {report.invalid > shown.length ? (
            <p className={styles.note}>{t('transfer.report.truncated', { shown: shown.length, total: report.invalid })}</p>
          ) : null}
        </>
      ) : null}
      <div className={styles.row}>
        {shown.length > 0 ? (
          <Button variant="secondary" onClick={onDownload}>
            {t('transfer.report.download')}
          </Button>
        ) : null}
        <Link to="/books">{t('transfer.report.goToBooks')}</Link>
      </div>
    </div>
  );
}
