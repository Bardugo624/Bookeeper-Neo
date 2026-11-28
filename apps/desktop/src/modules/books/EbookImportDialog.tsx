import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { EbookImportRow } from './EbookImportRow';
import { useEbookImport } from './useEbookImport';
import styles from './EbookImportDialog.module.css';

export interface EbookImportDialogProps {
  open: boolean;
  /** The files dropped on the library; the dialog is mounted anew for each drop. */
  files: File[];
  onClose(): void;
}

/** E-books dropped on the library: one row each, to check before the books are created. */
export function EbookImportDialog({ open, files, onClose }: EbookImportDialogProps) {
  const t = useT();
  const imp = useEbookImport(files);
  const done = imp.finished;
  const summary = imp.summary;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !imp.saving) onClose();
      }}
      size="wide"
      title={t('ebooks.title')}
      description={done ? undefined : t('ebooks.description')}
      closeLabel={t('common.close')}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            {t('ebooks.close')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" disabled={imp.saving} onClick={onClose}>
              {summary ? t('ebooks.close') : t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={imp.count === 0 || imp.uploading}
              loading={imp.saving}
              loadingLabel={t('ebooks.saving')}
              onClick={() => void imp.confirm()}
            >
              {t('ebooks.confirm', { count: imp.count })}
            </Button>
          </>
        )
      }
    >
      {summary ? (
        <div role="status" className={styles.summary}>
          <p>{t('ebooks.summary.added', { count: summary.added })}</p>
          <p>{t('ebooks.summary.attached', { count: summary.attached })}</p>
          {summary.failed > 0 ? <p className={styles.error}>{t('ebooks.summary.failed', { count: summary.failed })}</p> : null}
        </div>
      ) : null}
      <ul className={styles.list} aria-label={t('ebooks.list')}>
        {imp.rows.map((row) => (
          <EbookImportRow
            key={row.id}
            row={row}
            locked={imp.saving || done}
            onChange={(change) => imp.patch(row.id, { ...change, error: undefined })}
            onBlur={() => void imp.recheck(row.id)}
            onRemove={() => imp.remove(row.id)}
          />
        ))}
      </ul>
    </Dialog>
  );
}
