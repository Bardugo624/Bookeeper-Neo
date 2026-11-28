import { useState } from 'react';
import { Menu, type MenuEntry } from '@bookeeper/ui/overlays';
import { useReaderLocale, useReaderT } from '../../i18n';
import { HIGHLIGHT_COLORS, type HighlightColor } from '../../model/highlightColors';
import type { Theme } from '../../model/highlightColors';
import { swatch } from '../../model/highlights';
import { formatPercent } from '../view/format';
import { BookmarkIcon, MoreIcon } from '../view/icons';
import type { NoteEntry } from './types';
import styles from './NotesList.module.css';

export interface NoteItemProps {
  entry: NoteEntry;
  theme: Theme;
  onGo: (entry: NoteEntry) => void;
  onEditNote: (entry: NoteEntry) => void;
  onRecolor: (entry: NoteEntry, color: HighlightColor) => void;
  onCopy: (entry: NoteEntry) => void;
  onRemove: (entry: NoteEntry) => void;
}

/** One highlight or bookmark: the dot or bookmark, chapter and percent, the text in Lora and the note. */
export function NoteItem({ entry, theme, onGo, onEditNote, onRecolor, onCopy, onRemove }: NoteItemProps) {
  const t = useReaderT();
  const locale = useReaderLocale();
  const [recoloring, setRecoloring] = useState(false);
  const bookmark = entry.kind === 'bookmark';
  const where = [bookmark ? t('rpanel.notes.bookmark') : null, entry.chapter, formatPercent(entry.percent / 100, locale)]
    .filter(Boolean)
    .join(' · ');

  const menu: MenuEntry[] = [];
  if (!bookmark) {
    menu.push({ id: 'edit', label: t('rpanel.notes.edit'), onSelect: () => onEditNote(entry) });
    menu.push({ id: 'color', label: t('rpanel.notes.recolor'), onSelect: () => setRecoloring(true) });
  }
  menu.push({ id: 'copy', label: t('rpanel.notes.copy'), onSelect: () => onCopy(entry) });
  menu.push({ id: 'remove', label: t('rpanel.notes.remove'), danger: true, onSelect: () => onRemove(entry) });

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          {bookmark || !entry.color ? (
            <BookmarkIcon />
          ) : (
            <span className={styles.dot} style={{ background: swatch(entry.color, theme) }} />
          )}
        </span>
        <span className={styles.where}>{where}</span>
        <Menu
          trigger={
            <button type="button" className={styles.more} aria-label={t('rpanel.notes.menu')}>
              <MoreIcon />
            </button>
          }
          items={menu}
        />
      </div>
      <button type="button" className={styles.body} onClick={() => onGo(entry)}>
        <span className={styles.text}>«{entry.text}»</span>
      </button>
      {entry.note ? <p className={styles.note}>{entry.note}</p> : null}
      {recoloring ? (
        <div role="radiogroup" aria-label={t('rpanel.notes.recolor')} className={styles.colors}>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={entry.color === c}
              aria-label={t(`rpanel.notes.colors.${c}`)}
              className={styles.swatch}
              onClick={() => {
                setRecoloring(false);
                if (c !== entry.color) onRecolor(entry, c);
              }}
            >
              <span className={styles.dot} style={{ background: swatch(c, theme) }} />
            </button>
          ))}
        </div>
      ) : null}
    </li>
  );
}
