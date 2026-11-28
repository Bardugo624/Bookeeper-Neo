import { useCallback, useEffect, useRef } from 'react';

export interface KeyInfo {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
}
/** A thing Esc can close: the layers go top first. */
export interface Layer {
  open: boolean;
  close: () => void;
}
export interface ReaderKeys {
  onNext: () => void;
  onPrev: () => void;
  onSearch: () => void;
  onToggleChrome: () => void;
  layers: readonly Layer[];
  enabled?: boolean;
}

const INTERACTIVE = 'input,textarea,select,[contenteditable],[contenteditable=""],[contenteditable="true"]';
const OWN_KEYS = 'button,a[href],[role="slider"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"]';

/** Arrows, Page up/down, Space, Shift+Space, Esc by layers and Ctrl/Cmd+F. Returns the handler for keys the frame forwards. */
export function useReaderKeys(keys: ReaderKeys): (k: KeyInfo) => void {
  const ref = useRef(keys);
  ref.current = keys;

  const handle = useCallback((k: KeyInfo, target: Element | null = null): boolean => {
    const h = ref.current;
    if (h.enabled === false) return false;
    if (k.key === 'Escape') {
      const layer = h.layers.find((l) => l.open);
      if (layer) layer.close();
      else h.onToggleChrome();
      return true;
    }
    if ((k.ctrl || k.meta) && !k.alt && k.key.toLowerCase() === 'f') {
      h.onSearch();
      return true;
    }
    if (k.ctrl || k.meta || k.alt) return false;
    if (target?.closest(INTERACTIVE) || target?.closest('[role="slider"],[role="tablist"]')) return false;
    if (k.key === ' ' && target?.closest(OWN_KEYS)) return false;
    if (k.key === 'ArrowRight' || k.key === 'PageDown' || (k.key === ' ' && !k.shift)) h.onNext();
    else if (k.key === 'ArrowLeft' || k.key === 'PageUp' || (k.key === ' ' && k.shift)) h.onPrev();
    else return false;
    return true;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      // Dialogs and menus (Radix) look after their own keys, Esc included.
      if (target?.closest('[role="dialog"],[role="menu"]')) return;
      // A component that already took the key (tabs, lists…) keeps it.
      if (e.defaultPrevented) return;
      const k = { key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey };
      if (k.key === 'Escape' && target?.closest(INTERACTIVE) && !ref.current.layers.some((l) => l.open)) return;
      if (handle(k, target)) e.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handle]);

  return useCallback((k: KeyInfo) => void handle(k), [handle]);
}
