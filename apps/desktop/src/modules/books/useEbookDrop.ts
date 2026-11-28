import { useState, type DragEvent } from 'react';

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
// React events bubble through portals: a drop inside a dialog is not a drop on the page.
const onPage = (e: DragEvent) => e.currentTarget.contains(e.target as Node | null);

/**
 * A file drag the page does not take is still cancelled: left alone, the window would open the
 * file in place of the app. A drop zone inside (one that already took the drag) is left alone.
 */
function refuse(e: DragEvent) {
  if (e.defaultPrevented) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'none';
}

/** Drop target for e-books: the props to spread on the page, whether files hover it, and what was dropped. */
export function useEbookDrop(enabled: boolean, onDrop: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  const accepts = (e: DragEvent) => enabled && onPage(e) && !e.defaultPrevented;
  return {
    over: enabled && over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!carriesFiles(e)) return;
        if (!accepts(e)) return refuse(e);
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        if (!carriesFiles(e)) return;
        setOver(false);
        if (!accepts(e)) return refuse(e);
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onDrop(files);
      },
    },
  };
}
