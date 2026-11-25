import { Icon } from '@bookeeper/ui/base';
import { BookCover } from '@bookeeper/ui/book';
import { cx } from '../../kit/cx';
import type { PaletteItem } from './model';
import { usePaletteCover } from './usePaletteCover';
import styles from './Palette.module.css';

function Thumb({ item }: { item: PaletteItem }) {
  const book = item.book!;
  const src = usePaletteCover(book.id, book.cover_color);
  return <BookCover title={book.title} src={src} color={book.cover_color ?? undefined} width={26} className={styles.cover} />;
}

export interface PaletteRowProps {
  item: PaletteItem;
  id: string;
  selected: boolean;
  onHover(): void;
  onPick(): void;
}

export function PaletteRow({ item, id, selected, onHover, onPick }: PaletteRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      className={cx(styles.row, selected && styles.selected)}
      // Keep the focus in the text field while the mouse picks.
      onMouseDown={(e) => e.preventDefault()}
      onMouseMove={onHover}
      onClick={onPick}
    >
      {item.book ? (
        <Thumb item={item} />
      ) : item.icon ? (
        <span className={styles.icon}>
          <Icon name={item.icon} size={16} />
        </span>
      ) : null}
      <span className={styles.text}>
        <span className={styles.label}>{item.label}</span>
        {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
      </span>
    </div>
  );
}
