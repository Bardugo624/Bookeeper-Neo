import { Field, IconButton, Input, Spinner, Tag } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { uploadProblemKey } from './bookFiles';
import type { ImportRow } from './ebookImport';
import { useEbookCover } from './useEbookImport';
import styles from './EbookImportDialog.module.css';

export interface EbookImportRowProps {
  row: ImportRow;
  locked: boolean;
  onChange(change: Partial<ImportRow>): void;
  onBlur(): void;
  onRemove(): void;
}

/** One dropped file: its cover, the title and authors to correct, and what became of it. */
export function EbookImportRow({ row, locked, onChange, onBlur, onRemove }: EbookImportRowProps) {
  const t = useT();
  const cover = useEbookCover(row.info?.sha256, row.info?.has_cover === true);
  const problem = row.error !== undefined && row.status === 'error' ? uploadProblemKey(row.error) : null;
  const message = row.error === undefined ? null : problem ? t(problem) : apiErrorMessage(t, row.error);
  const editable = row.status === 'ready';
  const joining = row.attach && row.duplicate !== undefined;
  return (
    <li className={styles.row}>
      <div className={styles.cover} aria-hidden="true">
        {cover ? <img src={cover} alt="" className={styles.image} /> : null}
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <span className={styles.name}>{row.file.name}</span>
          {row.status === 'uploading' ? (
            <span className={styles.state}>
              <Spinner size={14} label={t('ebooks.row.uploading', { name: row.file.name })} />
              {t('ebooks.row.uploadingShort')}
            </span>
          ) : null}
          {row.outcome ? <Tag tone="ok">{t(`ebooks.row.${row.outcome}`)}</Tag> : null}
          {!locked && row.status !== 'done' ? (
            <IconButton icon="close" label={t('ebooks.row.remove', { name: row.file.name })} onClick={onRemove} />
          ) : null}
        </div>
        {editable || row.status === 'saving' ? (
          <div className={styles.fields}>
            <Field label={t('ebooks.row.title')} error={row.title.trim() === '' && !joining ? t('ebooks.row.titleMissing') : undefined}>
              <Input
                value={row.title}
                disabled={locked}
                onChange={(e) => onChange({ title: e.target.value })}
                onBlur={onBlur}
              />
            </Field>
            <Field label={t('ebooks.row.authors')} description={t('ebooks.row.authorsHint')}>
              <Input
                value={row.authors}
                disabled={locked}
                onChange={(e) => onChange({ authors: e.target.value })}
                onBlur={onBlur}
              />
            </Field>
          </div>
        ) : null}
        {row.duplicate && editable ? (
          <label className={styles.same}>
            <input
              type="checkbox"
              checked={row.attach}
              onChange={(e) => onChange({ attach: e.target.checked })}
            />
            <span>
              {t('ebooks.row.same', { title: row.duplicate.title })}
              <strong>{` ${t('ebooks.row.attach')}`}</strong>
            </span>
          </label>
        ) : null}
        {message ? (
          <p role="alert" className={styles.error}>
            {message}
          </p>
        ) : null}
      </div>
    </li>
  );
}
