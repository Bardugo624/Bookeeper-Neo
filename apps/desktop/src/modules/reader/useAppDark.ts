import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains('dark');

/** True while the app is in its dark theme: the reader's «Auto» follows it. */
export function useAppDark(): boolean {
  return useSyncExternalStore(subscribe, isDark, () => false);
}
