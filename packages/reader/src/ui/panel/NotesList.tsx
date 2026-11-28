import { useState } from 'react';
import { useReaderT } from '../../i18n';
import { HIGHLIGHT_COLORS, type HighlightColor, type Theme } from '../../model/highlightColors';
import { swatch } from '../../model/highlights';
import { BookmarkIcon } from '../view/icons';
import { NoteItem } from './NoteItem';
import type { NoteEntry } from './types';
import styles from './NotesList.module.css';

export type NotesFilter = 'all' | 'bookmarks' | HighlightColor;

export interface NotesListProps {
  items: readonly NoteEntry[];
  theme: Theme;
  onGo: (entry: NoteEntry) => void;
  onEditNote: (entry: NoteEntry) => void;
  onRecolor: (entry: NoteEntry, color: HighlightColor) => void;
  onCopy: (entry: NoteEntry) => void;
  /** Removes at once: the host offers «Annulla» in a notice. */
  onRemove: (entry: NoteEntry) => void;
  onExport: () => void;
}

const matches = (e: NoteEntry, f: NotesFilter): boolean =>
  f === 'all' || (f === 'bookmarks' ? e.kind === 'bookmark' : e.kind === 'highlight' && e.color === f);

/** Highlights and bookmarks in book order, filtered by «Tutte», «Segnalibri» or a color. */
export function NotesList({ items, theme, onExport, ...rest }: NotesListProps) {
  const t = useReaderT();
  const [filter, setFilter] = useState<NotesFilter>('all');
  const count = (f: NotesFilter) => items.filter((e) => matches(e, f)).length;
  const shown = items.filter((e) => matches(e, filter));

  const chip = (f: NotesFilter, name: string, content: React.ReactNode) => (
    <button
      key={f}
      type="button"
      className={styles.chip}
      aria-pressed={filter === f}
      aria-label={name}
      onClick={() => setFilter(f)}
    >
      {content}
    </button>
  );

  return (
    <div className={styles.notes}>
      <div className={styles.filters} role="group" aria-label={t('rpanel.notes.filters')}>
        {chip('all', t('rpanel.notes.all_filter', { count: count('all') }), `${t('rpanel.notes.all')} · ${count('all')}`)}
        {chip(
          'bookmarks',
          t('rpanel.notes.bookmark_filter', { count: count('bookmarks') }),
          <>
            <BookmarkIcon />
            <span aria-hidden="true">{count('bookmarks')}</span>
          </>,
        )}
        {HIGHLIGHT_COLORS.map((c) =>
          chip(
            c,
            t('rpanel.notes.color_filter', { color: t(`rpanel.notes.colors.${c}`), count: count(c) }),
            <>
              <span className={styles.dot} style={{ background: swatch(c, theme) }} />
              <span aria-hidden="true">{count(c)}</span>
            </>,
          ),
        )}
      </div>
      {shown.length === 0 ? (
        <p className={styles.empty}>{t(items.length === 0 ? 'rpanel.notes.empty' : 'rpanel.notes.empty_filter')}</p>
      ) : (
        <ul className={styles.list} aria-label={t('rpanel.notes.list')}>
          {shown.map((e) => (
            <NoteItem key={e.id} entry={e} theme={theme} {...rest} />
          ))}
        </ul>
      )}
      <footer className={styles.foot}>
        <span className={styles.private}>{t('rpanel.notes.private')}</span>
        <button type="button" className={styles.export} onClick={onExport}>
          {t('rpanel.notes.export')}
        </button>
      </footer>
    </div>
  );
}
