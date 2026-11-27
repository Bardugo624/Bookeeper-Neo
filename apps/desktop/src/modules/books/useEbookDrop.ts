import { useState, type DragEvent } from 'react';

// React events bubble through portals: a drop inside a dialog is not a drop on the page.
const hasFiles = (e: DragEvent) =>
  e.currentTarget.contains(e.target as Node | null) && Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** Drop target for e-books: the props to spread on the page, whether files hover it, and what was dropped. */
export function useEbookDrop(enabled: boolean, onDrop: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onDrop(files);
      },
    },
  };
}
