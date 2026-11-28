import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet } from '../../kit';
import styles from './InstallSheet.module.css';

/** On an iPhone in Safari: why the books need the Home Screen, and how to get there. */
export function InstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const steps = ['one', 'two', 'three'] as const;
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('mreader.offline.install.title')}
      footer={
        <Button variant="primary" className={styles.done} onClick={() => onOpenChange(false)}>
          {t('mreader.offline.install.done')}
        </Button>
      }
    >
      <p className={styles.why}>{t('mreader.offline.install.why')}</p>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step}>{t(`mreader.offline.install.${step}`)}</li>
        ))}
      </ol>
      <p className={styles.online}>{t('mreader.offline.install.online')}</p>
    </BottomSheet>
  );
}
