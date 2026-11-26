import { useState } from 'react';
import type { ShelfBook, ShelfOut } from '@bookeeper/api';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { SelectField } from './SelectField';
import { useShelfBooks } from './useShelves';
import styles from './PlaceDialog.module.css';

export interface PlaceDialogProps {
  book: { id: string; title: string };
  shelves: ShelfOut[];
  initialShelfId: string;
  /** The shelf (0-based) the dialog opens on; the first by default. */
  initialRow?: number;
  busy: boolean;
  /** Puts the book at the end of the chosen row. */
  onPlace(shelf: ShelfOut, books: ShelfBook[], rowIndex: number): void;
  onClose(): void;
}

/** "Place in…": the keyboard way to give an unplaced book a unit and a row. */
export function PlaceDialog({ book, shelves, initialShelfId, initialRow = 0, busy, onPlace, onClose }: PlaceDialogProps) {
  const t = useT();
  const [shelfId, setShelfId] = useState(initialShelfId);
  const [row, setRow] = useState(initialRow);
  const shelf = shelves.find((s) => s.id === shelfId) ?? shelves[0]!;
  const books = useShelfBooks(shelf.id);
  const rows = Array.from({ length: shelf.rows }, (_, i) => i);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('shelves.place.title', { title: book.title })}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            loadingLabel={t('common.saving')}
            disabled={!books.data}
            onClick={() => books.data && onPlace(shelf, books.data.items, row)}
          >
            {t('shelves.place.confirm')}
          </Button>
        </div>
      }
    >
      <div className={styles.fields}>
        <SelectField
          label={t('shelves.place.unit')}
          value={shelf.id}
          onChange={(id) => {
            setShelfId(id);
            setRow(0);
          }}
          options={shelves.map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectField
          label={t('shelves.place.row')}
          value={String(row)}
          onChange={(v) => setRow(Number(v))}
          options={rows.map((i) => ({ value: String(i), label: t('shelves.row', { n: i + 1 }) }))}
        />
      </div>
    </Dialog>
  );
}
