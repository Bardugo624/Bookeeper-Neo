import { Button, Skeleton } from '@bookeeper/ui/base';
import { useT, type Translate } from '../../../../app/i18n';
import { apiErrorMessage, useListParams } from '../../../../kit';
import { SettingsBlock } from '../../SettingsBlock';
import { AuditFilters } from './AuditFilters';
import { AuditTable } from './AuditTable';
import { AUDIT_PARAMS, CSV_MAX } from './auditModel';
import { useAuditExport } from './useAuditExport';
import { useAuditList, useAuditOptions } from './useAuditData';
import styles from './AuditSection.module.css';

/** One sentence: the reason is added only when it says more than the generic "something went wrong". */
function auditErrorText(t: Translate, error: unknown): string {
  const reason = apiErrorMessage(t, error);
  return reason === t('common.errors.generic') ? t('audit.errorPlain') : t('audit.error', { reason });
}

export function AuditSection() {
  const t = useT();
  const params = useListParams(AUDIT_PARAMS);
  const list = useAuditList(params.values);
  const options = useAuditOptions();
  const exp = useAuditExport(params.values);

  let body;
  if (list.forbidden) {
    body = (
      <p className={styles.error} role="alert">
        {t('audit.forbidden')}
      </p>
    );
  } else if (list.isError) {
    body = (
      <div className={styles.error} role="alert">
        <p>{auditErrorText(t, list.error)}</p>
        <Button variant="ghost" onClick={list.retry}>
          {t('audit.retry')}
        </Button>
      </div>
    );
  } else if (list.isPending) {
    body = (
      <div role="status" aria-label={t('audit.loading')} className={styles.skeletons}>
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    );
  } else {
    body = (
      <>
        <AuditTable items={list.items} />
        {list.hasMore ? (
          <Button variant="ghost" loading={list.loadingMore} loadingLabel={t('audit.loadingMore')} onClick={list.loadMore}>
            {t('audit.loadMore')}
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <SettingsBlock title={t('audit.title')} description={t('audit.description')}>
      <AuditFilters
        values={params.values}
        people={options.people}
        devices={options.devices}
        actions={options.actions}
        onChange={params.set}
        onReset={params.reset}
      />
      <div className={styles.bar}>
        <span className={styles.muted} aria-live="polite">
          {list.isPending || list.isError ? '' : t('audit.total', { count: list.total })}
        </span>
        <Button variant="ghost" loading={exp.busy} loadingLabel={t('audit.export.busy')} disabled={list.isPending || list.isError || list.total === 0} onClick={exp.submit}>
          {t('audit.export.button')}
        </Button>
      </div>
      {list.total > CSV_MAX ? <p className={styles.muted}>{t('audit.export.limit', { max: CSV_MAX, total: list.total })}</p> : null}
      {exp.problem ? (
        <p className={styles.error} role="alert">
          {exp.problem}
        </p>
      ) : null}
      {body}
    </SettingsBlock>
  );
}
