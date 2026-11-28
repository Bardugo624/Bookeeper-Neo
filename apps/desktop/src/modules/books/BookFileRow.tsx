import { useState } from 'react';
import { Button, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { ConfirmDialog, apiErrorMessage, usePermission } from '../../kit';
import { formatSize, type BookFile } from './bookFileApi';
import { DownloadBusyError, useDownloadBookFile, useRemoveBookFile } from './useBookFiles';
import styles from './BookFiles.module.css';

/** One attached file: its format, size and name, and what can be done with it. */
export function BookFileRow({ bookId, file, locale }: { bookId: string; file: BookFile; locale: string }) {
  const t = useT();
  const canEdit = usePermission().can('write');
  const download = useDownloadBookFile(bookId);
  const remove = useRemoveBookFile(bookId);
  const [confirming, setConfirming] = useState(false);
  const format = file.format.toUpperCase();
  const failure = download.isError ? download.error : remove.isError ? remove.error : null;
  return (
    <li className={styles.row}>
      <Tag className={styles.format}>{format}</Tag>
      <div className={styles.info}>
        <span className={styles.name}>{file.name}</span>
        <span className={styles.size}>{formatSize(locale, file.size_bytes)}</span>
        {file.missing ? <Tag tone="warn">{t('books.files.missing')}</Tag> : null}
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          disabled={file.missing}
          loading={download.isPending}
          loadingLabel={t('books.files.downloading')}
          aria-label={t('books.files.downloadLabel', { name: file.name })}
          onClick={() => download.mutate(file)}
        >
          {t('books.files.download')}
        </Button>
        {canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('books.files.removeLabel', { name: file.name })}
            onClick={() => setConfirming(true)}
          >
            {t('books.files.remove')}
          </Button>
        ) : null}
      </div>
      {failure ? (
        <p role="alert" className={styles.error}>
          {failure instanceof DownloadBusyError ? t('books.files.downloadBusy') : apiErrorMessage(t, failure)}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={t('books.files.confirm.title')}
        description={t('books.files.confirm.text')}
        confirmLabel={t('books.files.remove')}
        busy={remove.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => remove.mutate(file.id, { onSuccess: () => setConfirming(false), onError: () => setConfirming(false) })}
      />
    </li>
  );
}
