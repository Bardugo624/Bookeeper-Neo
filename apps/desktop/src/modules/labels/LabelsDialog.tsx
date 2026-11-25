import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { SheetPreview } from './SheetPreview';
import { useLabelsPdf } from './useLabelsPdf';
import styles from './LabelsDialog.module.css';

export interface LabelsDialogProps {
  bookIds: string[];
  open: boolean;
  onClose(): void;
}

/** "Labels": the sheet the core prints, a preview of the boxes in use, and "Create the PDF". */
export function LabelsDialog({ bookIds, open, onClose }: LabelsDialogProps) {
  const t = useT();
  const pdf = useLabelsPdf(bookIds, onClose, open);
  const count = bookIds.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pdf.busy) onClose();
      }}
      title={t('labels.title')}
      description={t('labels.summary', { count })}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" disabled={pdf.busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={pdf.blocked} loading={pdf.busy} loadingLabel={t('labels.creating')} onClick={pdf.submit}>
            {t('labels.create')}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        {pdf.problem ? (
          <p role="alert" className={styles.error}>
            {pdf.problem}
          </p>
        ) : null}
        <p className={styles.sheetInfo}>{t('labels.sheet')}</p>
        <SheetPreview count={count} />
        <p className={styles.note}>{t('labels.note')}</p>
      </div>
    </Dialog>
  );
}
