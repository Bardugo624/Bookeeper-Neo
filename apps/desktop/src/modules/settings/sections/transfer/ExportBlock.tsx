import { Button } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../../../app/i18n';
import { SettingsBlock } from '../../SettingsBlock';
import { EXPORT_FORMATS, isExportFormat } from './transferModel';
import { useExport } from './useExport';
import styles from './TransferSection.module.css';

export function ExportBlock() {
  const t = useT();
  const exp = useExport();

  return (
    <SettingsBlock title={t('transfer.export.title')} description={t('transfer.export.description')}>
      <PillTabs
        variant="segmented"
        label={t('transfer.export.format.label')}
        value={exp.format}
        onChange={(id) => isExportFormat(id) && exp.setFormat(id)}
        items={EXPORT_FORMATS.map((f) => ({ id: f, label: t(`transfer.export.format.${f}`) }))}
      />
      {exp.problem ? (
        <p className={styles.failure} role="alert">
          {exp.problem}
        </p>
      ) : null}
      <Button variant="primary" loading={exp.busy} loadingLabel={t('transfer.export.submitting')} onClick={exp.submit}>
        {t('transfer.export.submit')}
      </Button>
    </SettingsBlock>
  );
}
