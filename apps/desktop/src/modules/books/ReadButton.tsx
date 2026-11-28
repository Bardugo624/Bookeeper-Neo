import { useNavigate } from 'react-router';
import type { BookOut } from '@bookeeper/api';
import { Button, IconButton } from '@bookeeper/ui/base';
import { Menu } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { usePermission } from '../../kit';
import { ringPercent, useReading } from '../reading';
import { pickFile } from '../reader/pickFile';
import { useBookFiles } from './useBookFiles';
import { readPath } from './format';

/**
 * «Leggi» of the book page: opens the best file in the reader, with the percent when the book is started.
 * A menu beside it opens the other files. Drawn only for who may read the files (member or more) and
 * when the book has one.
 */
export function ReadButton({ book }: { book: BookOut }) {
  const t = useT();
  const navigate = useNavigate();
  const allowed = usePermission().can('write') && book.file_formats.length > 0;
  const files = useBookFiles(book.id, allowed);
  const { data: reading } = useReading(book.id);
  if (!allowed) return null;

  const readable = (files.data ?? []).filter((f) => !f.missing);
  const main = pickFile(readable, null);
  const others = readable.filter((f) => f.id !== main?.id);
  const percent = reading && reading.status === 'reading' ? ringPercent(reading, book.page_count) : null;
  const label = percent ? t('books.read.readPercent', { percent }) : t('books.read.read');

  return (
    <>
      <Button
        variant="primary"
        icon="book"
        disabled={!main}
        onClick={() => main && void navigate(readPath(book.id, main.id))}
      >
        {label}
      </Button>
      {others.length > 0 ? (
        <Menu
          trigger={<IconButton icon="chevron-down" label={t('books.read.more')} />}
          items={others.map((f) => ({
            id: f.id,
            label: t('books.read.open', { format: f.format.toUpperCase() }),
            onSelect: () => void navigate(readPath(book.id, f.id)),
          }))}
        />
      ) : null}
    </>
  );
}
