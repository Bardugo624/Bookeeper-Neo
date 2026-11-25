import { Button } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { SettingsBlock } from '../../SettingsBlock';
import { ImportDropzone } from './ImportDropzone';
import { ImportReportView } from './ImportReportView';
import { IMPORT_FORMATS, isImportFormat } from './transferModel';
import { useImport } from './useImport';
import styles from './TransferSection.module.css';

export function ImportBlock() {
  const t = useT();
  const imp = useImport();

  return (
    <SettingsBlock title={t('transfer.import.title')} description={t('transfer.import.description')}>
      <PillTabs
        variant="segmented"
        label={t('transfer.import.format.label')}
        value={imp.format}
        onChange={(id) => isImportFormat(id) && imp.setFormat(id)}
        items={IMPORT_FORMATS.map((f) => ({ id: f, label: t(`transfer.import.format.${f}`) }))}
      />
      <ImportDropzone disabled={imp.busy} onPick={imp.choose} />
      {imp.file ? (
        <p className={styles.note}>{t('transfer.import.selected', { name: imp.file.name, size: Math.max(1, Math.round(imp.file.size / 1024)) })}</p>
      ) : null}
      {imp.problem ? (
        <p className={styles.failure} role="alert">
          {imp.problem}
        </p>
      ) : null}
      {imp.busy ? <div className={styles.progress} role="progressbar" aria-label={t('transfer.import.progress')} /> : null}
      <Button variant="primary" disabled={!imp.file} loading={imp.busy} loadingLabel={t('transfer.import.submitting')} onClick={imp.submit}>
        {t('transfer.import.submit')}
      </Button>
      {imp.report ? <ImportReportView report={imp.report} onDownload={() => void imp.downloadErrors()} /> : null}
    </SettingsBlock>
  );
}
