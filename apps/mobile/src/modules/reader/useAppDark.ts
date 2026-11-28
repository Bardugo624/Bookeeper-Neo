import { useSyncExternalStore } from 'react';

const html = () => document.documentElement;

function subscribe(listener: () => void): () => void {
  const watcher = new MutationObserver(listener);
  watcher.observe(html(), { attributes: true, attributeFilter: ['class'] });
  return () => watcher.disconnect();
}

/** The app is dark now (the `dark` class of `<html>`, which the theme choice and the phone's setting drive). */
export function useAppDark(): boolean {
  return useSyncExternalStore(subscribe, () => html().classList.contains('dark'), () => false);
}
