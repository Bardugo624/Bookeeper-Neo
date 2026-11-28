import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnnotationOut } from '@bookeeper/api';
import { createAnnotationStore, type ReaderBackend } from '../data';
import type { Engine } from '../engine';
import type { HighlightColor, Mark, Relocation } from '../engine/protocol';
import { HIGHLIGHT_COLORS } from '../model';
import type { NoteEntry } from '../ui/panel';
import { labelOfHref, newId, nowSeconds } from './helpers';
import type { Opened } from './useBookSession';

const isColor = (c: string | null | undefined): c is HighlightColor => HIGHLIGHT_COLORS.includes(c as HighlightColor);

export function useAnnotations(
  backend: ReaderBackend,
  ids: { bookId: string; sha256: string },
  engine: Engine | null,
  opened: Opened | null,
  relocation: Relocation | null,
  pageSpan: number,
) {
  // The id of the next `add`, when the caller needs it before the server answers.
  const reserved = useRef<string | null>(null);
  const store = useMemo(
    () => createAnnotationStore(backend, ids, nowSeconds, () => reserved.current ?? newId()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backend, ids.bookId, ids.sha256],
  );
  const [rev, setRev] = useState(0);
  useEffect(() => store.subscribe(() => setRev((r) => r + 1)), [store]);
  // Takes the waiting changes and the new ones now and whenever the network comes back.
  useEffect(() => {
    const sync = () => void store.sync().catch(() => undefined);
    sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [store]);

  // The book's other files (an EPUB and a PDF, two editions) have their own places: only this file's show.
  const items = useMemo(() => store.list().filter((a) => a.file_sha256 === ids.sha256), [store, rev, ids.sha256]);

  /** Adds at once and gives the new id now: the screen does not wait for the server. */
  const addNow = useCallback(
    (input: Parameters<typeof store.add>[0]): string => {
      const id = newId();
      reserved.current = id;
      // `add` takes its id and puts the annotation in the store before its first wait.
      store.add(input).catch(() => undefined);
      reserved.current = null;
      return id;
    },
    [store],
  );

  // The highlights are drawn in the frame; a bookmark is not.
  useEffect(() => {
    if (!engine || !opened) return;
    const marks: Mark[] = items
      .filter((a) => a.kind === 'highlight' && isColor(a.color))
      .map((a) => ({ id: a.id, cfi: a.cfi, color: a.color as HighlightColor, hasNote: !!a.note?.trim() }));
    engine.setMarks(marks);
  }, [engine, opened, items]);

  const toc = opened?.toc;
  const where = useRef({ relocation, toc });
  where.current = { relocation, toc };
  /** The percent and chapter of the page now, for a new note. */
  const here = useCallback(() => {
    const { relocation: r, toc: tree } = where.current;
    return {
      percent: r ? Math.min(100, Math.max(0, r.fraction * 100)) : 0,
      chapter: r && tree ? labelOfHref(tree, r.tocHref) : null,
    };
  }, []);

  /** Bookmarks on this page: the same start, or a start inside the page. */
  const pageBookmarks = useMemo(() => {
    if (!relocation) return [];
    return items.filter((a) => {
      if (a.kind !== 'bookmark') return false;
      if (a.cfi === relocation.cfi) return true;
      const at = a.percent / 100;
      return pageSpan > 0 && at >= relocation.fraction && at < relocation.fraction + pageSpan;
    });
  }, [items, relocation, pageSpan]);

  const toggleBookmark = useCallback(() => {
    if (!relocation) return;
    if (pageBookmarks.length) {
      for (const b of pageBookmarks) void store.remove(b.id);
    } else {
      void store.add({ kind: 'bookmark', cfi: relocation.cfi, ...here() });
    }
  }, [relocation, pageBookmarks, store, here]);

  const entries: NoteEntry[] = useMemo(() => items.map(toEntry), [items]);
  return { store, addNow, items, entries, here, bookmarked: pageBookmarks.length > 0, toggleBookmark };
}

function toEntry(a: AnnotationOut): NoteEntry {
  return {
    id: a.id,
    kind: a.kind === 'bookmark' ? 'bookmark' : 'highlight',
    color: isColor(a.color) ? a.color : null,
    chapter: a.chapter ?? null,
    percent: a.percent,
    text: a.text,
    note: a.note ?? null,
  };
}
