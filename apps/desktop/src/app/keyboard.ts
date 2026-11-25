/** True on macOS and iOS, where the command key replaces Ctrl. */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
}

const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'file', 'submit', 'reset', 'color', 'image']);

/** The element takes typed characters: single-key shortcuts must leave it alone. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  const role = el.getAttribute('role');
  return role !== null && TEXT_ROLES.has(role);
}

/** A modal dialog (palette included) is on screen. */
export function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"],[role="alertdialog"]') !== null;
}

/**
 * A plain key (no Ctrl, Cmd or Alt) pressed where it should act as a shortcut: not while typing,
 * not over a dialog, not as part of a combination with the browser or the system.
 */
export function isPlainShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
  return !isTypingTarget(e.target) && !dialogOpen();
}
