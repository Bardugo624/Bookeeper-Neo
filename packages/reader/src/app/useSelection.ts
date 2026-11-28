import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationOut } from '@bookeeper/api';
import type { AnnotationStore, NewAnnotation, ReaderBackend } from '../data';
import type { Engine } from '../engine';
import type { HighlightColor, Rect } from '../engine/protocol';
import { webSearchUrl } from './helpers';

export interface Selection {
  /** The highlight that was tapped, or null for a fresh selection. */
  id: string | null;
  cfi: string;
  text: string;
  rect: Rect;
  color: HighlightColor | null;
}
export interface Editing {
  id: string;
  value: string;
}
interface Here {
  percent: number;
  chapter: string | null;
}

const LAST_COLOR = 'bookeeper.reader.lastColor';

function loadColor(): HighlightColor {
  try {
    const v = window.localStorage.getItem(LAST_COLOR);
    if (v === 'amber' || v === 'sage' || v === 'terracotta' || v === 'night') return v;
  } catch {
    // Default.
  }
  return 'amber';
}

export interface SelectionActions {
  selection: Selection | null;
  dismiss: () => void;
  color: (c: HighlightColor) => void;
  note: () => void;
  copy: () => void;
  search: () => void;
  remove: () => void;
  saveNote: (text: string) => void;
}

/** The selection bar, the highlight it makes and the note editor. */
export function useSelection(
  engine: Engine | null,
  backend: ReaderBackend,
  store: AnnotationStore,
  addNow: (input: NewAnnotation) => string,
  items: readonly AnnotationOut[],
  here: () => Here,
  editing: Editing | null,
  setEditing: (e: Editing | null) => void,
  onCopied: (text: string) => void,
  onRemoved: (a: AnnotationOut) => void,
): SelectionActions {
  const [selection, setSelection] = useState<Selection | null>(null);
  const lastColor = useRef<HighlightColor>(loadColor());
  const known = useRef(items);
  known.current = items;

  useEffect(() => {
    if (!engine) return;
    const offs = [
      engine.on('selection', (m) => setSelection({ id: null, cfi: m.cfi, text: m.text, rect: m.rect, color: null })),
      engine.on('selection-cleared', () => setSelection(null)),
      engine.on('mark-click', (m) => {
        const a = known.current.find((x) => x.id === m.id);
        if (a) setSelection({ id: a.id, cfi: a.cfi, text: a.text, rect: m.rect, color: (a.color as HighlightColor | null) ?? null });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [engine]);

  const dismiss = useCallback(() => {
    setSelection(null);
    engine?.clearSelection();
  }, [engine]);

  const remember = (c: HighlightColor) => {
    lastColor.current = c;
    try {
      window.localStorage.setItem(LAST_COLOR, c);
    } catch {
      // Not kept.
    }
  };

  const color = useCallback(
    (c: HighlightColor) => {
      const s = selection;
      if (!s) return;
      remember(c);
      if (s.id) void store.update(s.id, { color: c });
      else void store.add({ kind: 'highlight', cfi: s.cfi, text: s.text, color: c, ...here() });
      dismiss();
    },
    [selection, store, here, dismiss],
  );

  const note = useCallback(() => {
    const s = selection;
    if (!s) return;
    if (s.id) {
      const a = known.current.find((x) => x.id === s.id);
      setEditing({ id: s.id, value: a?.note ?? '' });
    } else {
      // The note goes on a highlight in the color used last.
      const id = addNow({ kind: 'highlight', cfi: s.cfi, text: s.text, color: lastColor.current, ...here() });
      setEditing({ id, value: '' });
    }
    dismiss();
  }, [selection, addNow, here, dismiss, setEditing]);

  const copy = useCallback(() => {
    if (!selection) return;
    onCopied(selection.text);
    dismiss();
  }, [selection, onCopied, dismiss]);

  const search = useCallback(() => {
    if (!selection) return;
    backend.openExternal(webSearchUrl(selection.text));
    dismiss();
  }, [selection, backend, dismiss]);

  const remove = useCallback(() => {
    const s = selection;
    if (!s?.id) return;
    const a = known.current.find((x) => x.id === s.id);
    void store.remove(s.id);
    if (a) onRemoved(a);
    dismiss();
  }, [selection, store, onRemoved, dismiss]);

  const saveNote = useCallback(
    (text: string) => {
      const e = editing;
      setEditing(null);
      if (e) void store.update(e.id, { note: text.trim() ? text : null });
    },
    [editing, store, setEditing],
  );

  return { selection, dismiss, color, note, copy, search, remove, saveNote };
}
