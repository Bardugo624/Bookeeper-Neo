import { useRef, useState, type DragEvent } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, Icon, Skeleton } from '@bookeeper/ui/base';
import { useLocale, useT } from '../../app';
import { apiErrorMessage, usePermission } from '../../kit';
import { BookFileRow } from './BookFileRow';
import { EBOOK_ACCEPT, uploadProblemKey, uploadProblemMessage } from './bookFileApi';
import { useAddBookFile, useBookFiles } from './useBookFiles';
import styles from './BookFiles.module.css';

/**
 * The "File" block of the book page: the e-books attached to the book, to download, take off or add.
 * A guest gets nothing: the block is not drawn and no request is made.
 */
export function BookFiles({ book }: { book: BookOut }) {
  const t = useT();
  const locale = useLocale();
  const allowed = usePermission().can('write');
  const files = useBookFiles(book.id, allowed);
  const add = useAddBookFile(book.id);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  if (!allowed) return null;

  const pick = (file: File | undefined) => {
    if (!file || add.isPending) return;
    setAdding(file.name);
    add.mutate(file);
  };
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (!add.isPending) setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      pick(e.dataTransfer.files[0]);
    },
  };

  const problem = uploadProblemKey(add.error);
  const addError = add.isError ? (problem ? t(problem) : (uploadProblemMessage(add.error) ?? apiErrorMessage(t, add.error))) : null;
  let body;
  if (files.isPending) {
    body = (
      <div role="status" aria-label={t('books.files.loading')}>
        <Skeleton shape="line" width="100%" height={44} />
      </div>
    );
  } else if (files.isError) {
    body = (
      <>
        <p className={styles.note}>{t('books.files.error')}</p>
        <Button size="sm" onClick={() => void files.refetch()}>
          {t('books.files.retry')}
        </Button>
      </>
    );
  } else if (files.data.length === 0) {
    body = <p className={styles.note}>{t('books.files.empty')}</p>;
  } else {
    body = (
      <ul className={styles.list}>
        {files.data.map((file) => (
          <BookFileRow key={file.id} bookId={book.id} file={file} locale={locale} />
        ))}
      </ul>
    );
  }

  return (
    <section
      className={over ? `${styles.block} ${styles.over}` : styles.block}
      aria-labelledby={`files-${book.id}`}
      {...dropProps}
    >
      <h2 id={`files-${book.id}`} className={styles.heading}>
        <Icon name="book" size={14} />
        {t('books.files.title')}
      </h2>
      {body}
      <div className={styles.add}>
        <input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          accept={EBOOK_ACCEPT}
          aria-label={t('books.files.input')}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          icon="plus"
          loading={add.isPending}
          loadingLabel={t('books.files.adding')}
          onClick={() => input.current?.click()}
        >
          {t('books.files.add')}
        </Button>
        <span className={styles.hint}>{over ? t('books.files.drop') : t('books.files.formats')}</span>
      </div>
      {add.isPending && adding ? (
        <p role="status" className={styles.note}>
          {t('books.files.uploading', { name: adding })}
        </p>
      ) : null}
      {addError ? (
        <p role="alert" className={styles.error}>
          {addError}
        </p>
      ) : null}
    </section>
  );
}
