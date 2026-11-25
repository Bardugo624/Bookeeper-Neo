import { useEffect } from 'react';
import { Spinner } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { BottomSheet, ErrorState, apiErrorMessage } from '../../kit';
import type { Isbn } from './isbn';
import { AddedBody } from './AddedBody';
import { FoundBody } from './FoundBody';
import { NoneBody } from './NoneBody';
import { OwnedBody } from './OwnedBody';
import { useAddBook } from './useAddBook';
import { useIsbnLookup } from './useIsbnLookup';
import styles from './Sheet.module.css';

export interface ResultSheetProps {
  /** The code being looked at; `null` keeps the sheet closed. */
  isbn: Isbn | null;
  canWrite: boolean;
  onClose: () => void;
  /** A book was created (not a duplicate). */
  onAdded: () => void;
}

export function ResultSheet({ isbn, canWrite, onClose, onAdded }: ResultSheetProps) {
  const t = useT();
  const lookup = useIsbnLookup(isbn);
  const add = useAddBook(onAdded);
  const reset = add.reset;
  const key = isbn?.isbn13;
  useEffect(() => reset(), [key, reset]);

  const addError = add.isError ? apiErrorMessage(t, add.error) : null;
  const data = lookup.data;
  const added = add.data;

  let title = t('mscan.sheet.looking');
  let body = (
    <div className={styles.loading} role="status" aria-label={t('mscan.sheet.looking')}>
      <Spinner label={t('mscan.sheet.looking')} />
    </div>
  );

  if (added) {
    title = added.book.title;
    body =
      added.kind === 'created' ? <AddedBody book={added.book} onAnother={onClose} /> : <OwnedBody book={added.book} />;
  } else if (lookup.isError) {
    title = t('mscan.sheet.error.title');
    body = <ErrorState message={apiErrorMessage(t, lookup.error)} onRetry={() => void lookup.refetch()} />;
  } else if (data && isbn) {
    if (data.kind === 'owned') {
      title = data.book.title;
      body = <OwnedBody book={data.book} />;
    } else if (data.kind === 'found') {
      title = data.meta.title ?? '';
      body = (
        <FoundBody
          meta={data.meta}
          isbn13={isbn.isbn13}
          canWrite={canWrite}
          adding={add.isPending}
          error={addError}
          onAdd={() => add.mutate({ isbn, meta: data.meta, title: data.meta.title ?? '' })}
        />
      );
    } else {
      title = t('mscan.sheet.none.title');
      body = (
        <NoneBody
          isbn13={isbn.isbn13}
          canWrite={canWrite}
          adding={add.isPending}
          error={addError}
          onAdd={(typed) => add.mutate({ isbn, title: typed })}
        />
      );
    }
  }

  return (
    <BottomSheet open={isbn !== null} onOpenChange={(open) => !open && onClose()} title={title}>
      {body}
    </BottomSheet>
  );
}
