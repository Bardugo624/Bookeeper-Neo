const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/**
 * Cancels the file drags no page took. With Tauri's own drag and drop turned off
 * (`dragDropEnabled: false`), a file dropped where nobody handles it makes the window open it in
 * place of the app. Listening on the window, after every page handler, it only refuses what is left.
 * Returns the function that removes it.
 */
export function installFileDropGuard(target: Window = window): () => void {
  const guard = (e: DragEvent) => {
    if (e.defaultPrevented || !carriesFiles(e)) return;
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
