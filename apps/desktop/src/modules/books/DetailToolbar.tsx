import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { Button, IconButton } from '@bookeeper/ui/base';
import { Menu } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { LabelsDialog } from '../labels';
import { BookDialog } from './BookDialog';
import styles from './DetailToolbar.module.css';

/** "Edit" and the "More" menu (labels) of the book page, with their dialogs. */
export function DetailToolbar({ book }: { book: BookOut }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  // The "Edit" button: the dialog grows from it and gives the focus back.
  const [origin, setOrigin] = useState<HTMLElement | null>(null);
  const [labelling, setLabelling] = useState(false);

  return (
    <div className={styles.toolbar}>
      <Button variant="secondary" icon="pencil" onClick={(e) => {
          setOrigin(e.currentTarget);
          setEditing(true);
        }}>
        {t('common.edit')}
      </Button>
      <Menu
        trigger={<IconButton icon="more" label={t('books.detail.more')} />}
        items={[
          { id: 'label', label: t('labels.menu'), icon: 'grid', onSelect: () => setLabelling(true) },
        ]}
      />
      <BookDialog open={editing} book={book} origin={origin} onClose={() => setEditing(false)} />
      <LabelsDialog bookIds={[book.id]} open={labelling} onClose={() => setLabelling(false)} />
    </div>
  );
}
