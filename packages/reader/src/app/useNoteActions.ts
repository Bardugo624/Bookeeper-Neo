import { useCallback } from 'react';
import type { AnnotationOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import type { AnnotationStore, ReaderBackend } from '../data';
import type { HighlightColor, Target } from '../engine/protocol';
import { EXPORT_LABELS, exportMarkdown, markdownFileName, type ExportItem } from '../model';
import { useReaderLocale, useReaderT } from '../i18n';
import type { NoteEntry } from '../ui/panel';
import type { Editing } from './useSelection';

interface Input {
  backend: ReaderBackend;
  book: { title: string; authors: string[] };
  store: AnnotationStore;
  items: readonly AnnotationOut[];
  goTo: (target: Target) => void;
  setEditing: (e: Editing | null) => void;
}

/** What the notes list and the selection bar do, with the notices that go with them. */
export function useNoteActions({ backend, book, store, items, goTo, setEditing }: Input) {
  const t = useReaderT();
  const locale = useReaderLocale();
  const toast = useToast();
  const find = (id: string) => items.find((a) => a.id === id);

  const copyText = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast.show({ title: t('reader.notes.copied'), tone: 'ok' });
      } catch {
        toast.show({ title: t('reader.notes.copy_failed'), tone: 'danger' });
      }
    },
    [toast, t],
  );

  /** «Togli» does not ask: the notice offers «Annulla», which writes the same note again. */
  const removed = useCallback(
    (a: AnnotationOut) => {
      toast.show({
        title: t('reader.notes.removed'),
        action: {
          label: t('reader.notes.undo'),
          onClick: () =>
            void store.add({
              kind: a.kind === 'bookmark' ? 'bookmark' : 'highlight',
              cfi: a.cfi,
              text: a.text,
              color: a.color,
              note: a.note,
              percent: a.percent,
              chapter: a.chapter,
            }),
        },
      });
    },
    [toast, t, store],
  );

  const exportNotes = useCallback(async () => {
    const meta = { title: book.title, author: book.authors.join(', ') || null };
    const list: ExportItem[] = items.map((a) => ({
      kind: a.kind === 'bookmark' ? 'bookmark' : 'highlight',
      chapter: a.chapter ?? null,
      text: a.text,
      note: a.note ?? null,
      percent: a.percent,
      color: (a.color as HighlightColor | null) ?? null,
    }));
    try {
      await backend.saveText(markdownFileName(meta), exportMarkdown(meta, list, EXPORT_LABELS[locale]));
      toast.show({ title: t('reader.notes.exported'), tone: 'ok' });
    } catch {
      toast.show({ title: t('reader.notes.export_failed'), tone: 'danger' });
    }
  }, [backend, book, items, locale, toast, t]);

  return {
    copyText,
    removed,
    notes: {
      onGo: (e: NoteEntry) => {
        const a = find(e.id);
        if (a) goTo({ cfi: a.cfi });
      },
      onEditNote: (e: NoteEntry) => setEditing({ id: e.id, value: find(e.id)?.note ?? '' }),
      onRecolor: (e: NoteEntry, color: HighlightColor) => void store.update(e.id, { color }),
      onCopy: (e: NoteEntry) => void copyText(e.text),
      onRemove: (e: NoteEntry) => {
        const a = find(e.id);
        void store.remove(e.id);
        if (a) removed(a);
      },
      onExport: () => void exportNotes(),
    },
  };
}
