import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { LendDialog } from '../loans';

/** "Lend": opens the loan dialog with this book already chosen. Not shown for a book on loan. */
export function LendButton({ book }: { book: BookOut }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (book.on_loan) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {t('books.detail.lend')}
      </Button>
      <LendDialog book={{ id: book.id, title: book.title }} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
