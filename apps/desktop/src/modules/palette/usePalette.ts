import { useCallback, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../app';
import { useOverlays } from '../../app/overlays';
import type { AppModule } from '../../app/types';
import { wherePhrase } from '../shelves';
import { arrange, bookAddress, matches, shelfAddress, shelfName, whereQuery, type PaletteItem } from './model';
import { useBookResults, useShelfNames } from './useBookResults';
import { useCommands } from './useCommands';

/** Text, results and keyboard of the open palette. */
export function usePalette(modules: AppModule[]) {
  const t = useT();
  const navigate = useNavigate();
  const close = useOverlays((s) => s.closePalette);
  const id = useId();
  const [text, setTextRaw] = useState('');
  const [cursor, setCursor] = useState(0);
  const setText = useCallback((value: string) => {
    setTextRaw(value);
    setCursor(0);
  }, []);
  const ask = useCallback(() => setText(t('palette.where.prefix')), [setText, t]);

  const where = whereQuery(text);
  const found = useBookResults(where ?? text, true);
  const shelves = useShelfNames(where !== null);
  const commands = useCommands(modules, ask);

  const items = useMemo(() => {
    const local = where === null ? commands.filter((c) => matches(c, text)) : [];
    const books = found.books.map<PaletteItem>((book) => {
      const author = book.authors.join(', ');
      const base = { id: `book:${book.id}`, book, label: book.title };
      if (where === null) return { ...base, group: 'books', detail: author, run: () => navigate(bookAddress(book.id)) };
      const p = book.placement;
      const place = p
        ? wherePhrase(t, { ...p, shelfName: shelfName(shelves, p) })
        : t('palette.where.none');
      return { ...base, group: 'where', detail: place, run: () => navigate(p ? shelfAddress(p, book.id) : bookAddress(book.id)) };
    });
    return arrange([...local, ...books], text.trim() === '');
  }, [where, commands, text, found.books, shelves, navigate, t]);

  const active = items.length ? Math.min(cursor, items.length - 1) : -1;
  const optionId = (i: number) => `${id}-option-${i}`;

  const run = useCallback(
    (item: PaletteItem) => {
      if (!item.keep) close();
      item.run();
    },
    [close],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = items.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setCursor((active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) run(item);
    }
  };

  const hint = where !== null && where.length < 2 ? ('whereHint' as const) : null;
  return {
    id,
    text,
    setText,
    items,
    active,
    setCursor,
    optionId,
    run,
    onKeyDown,
    pending: found.pending,
    hint,
    listId: `${id}-list`,
  };
}
