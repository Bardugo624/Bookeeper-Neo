import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, Icon } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { FILE_ACCEPT, formatSize } from './filesModel';
import { useAddFile, useBookFiles, useDownloadFile } from './useBookFiles';
import blocks from './Blocks.module.css';
import styles from './BookFiles.module.css';

/** The e-book files of a book: format, size and a download; people who can edit may add one. */
export function BookFiles({ book, canAdd }: { book: BookOut; canAdd: boolean }) {
  const t = useT();
  const locale = useLocale();
  const files = useBookFiles(book.id, true);
  const download = useDownloadFile(book.id);
  const add = useAddFile(book.id);
  const [busy, setBusy] = useState<string | null>(null);

  const errors = {
    unsupported_format: t('msearch.files.errors.unsupported_format'),
    drm_protected: t('msearch.files.errors.drm_protected'),
    file_already_attached: t('msearch.files.errors.file_already_attached'),
    payload_too_large: t('msearch.files.errors.payload_too_large'),
  };
  const failure = add.error ?? download.error;
  const items = files.data ?? [];
  if (files.isPending && !files.isError) return null;
  if (items.length === 0 && !canAdd && !failure && !files.isError) return null;

  return (
    <section className={blocks.block} aria-labelledby="files-title">
      <h2 id="files-title" className={blocks.heading}>
        {t('msearch.files.title')}
      </h2>
      {files.isError ? (
        <>
          <p role="alert" className={styles.error}>
            {apiErrorMessage(t, files.error)}
          </p>
          <Button variant="secondary" className={styles.action} onClick={() => void files.refetch()}>
            {t('msearch.files.retry')}
          </Button>
        </>
      ) : null}
      {!files.isError && items.length === 0 ? <p className={styles.none}>{t('msearch.files.none')}</p> : null}
      <ul className={styles.list}>
        {items.map((file) => (
          <li key={file.id} className={styles.item}>
            <div className={styles.info}>
              <span className={styles.format}>{file.format.toUpperCase()}</span>
              <span className={styles.size}>{file.missing ? t('msearch.files.missing') : formatSize(locale, file.size_bytes)}</span>
            </div>
            {file.missing ? null : (
              <Button
                variant="secondary"
                className={styles.action}
                aria-label={t('msearch.files.downloadLabel', { format: file.format.toUpperCase(), size: formatSize(locale, file.size_bytes) })}
                loading={busy === file.id && download.isPending}
                loadingLabel={t('msearch.files.downloading')}
                onClick={() => {
                  setBusy(file.id);
                  add.reset();
                  download.mutate(file);
                }}
              >
                {t('msearch.files.download')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canAdd ? (
        <label className={`${styles.add} ${add.isPending ? styles.adding : ''}`}>
          <Icon name="plus" size={16} />
          <span>{add.isPending ? t('msearch.files.adding') : t('msearch.files.add')}</span>
          <input
            type="file"
            accept={FILE_ACCEPT}
            className={styles.picker}
            disabled={add.isPending}
            aria-label={t('msearch.files.add')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              download.reset();
              add.mutate(file);
            }}
          />
        </label>
      ) : null}
      {failure ? (
        <p role="alert" className={styles.error}>
          {apiErrorMessage(t, failure, errors)}
        </p>
      ) : null}
    </section>
  );
}
