/** What a drag from another app can carry that the window would navigate to or open. */
const CARRIED = ['Files', 'text/uri-list', 'text/plain'];
const carriesSomething = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).some((t) => CARRIED.includes(t));

/** Over an editable field a dragged text still drops in as usual. */
const overEditable = (e: DragEvent) =>
  e.target instanceof Element && e.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null;

/**
 * Cancels the file and link drags no page took (links: `text/uri-list`, `text/plain`), except over an editable field. With Tauri's own drag and drop turned off
 * (`dragDropEnabled: false`), a file dropped where nobody handles it makes the window open it in
 * place of the app. Listening on the window, after every page handler, it only refuses what is left.
 * Returns the function that removes it.
 */
export function installFileDropGuard(target: Window = window): () => void {
  const guard = (e: DragEvent) => {
    if (e.defaultPrevented || !carriesSomething(e) || overEditable(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  };
  target.addEventListener('dragover', guard);
  target.addEventListener('drop', guard);
  return () => {
    target.removeEventListener('dragover', guard);
    target.removeEventListener('drop', guard);
  };
}
