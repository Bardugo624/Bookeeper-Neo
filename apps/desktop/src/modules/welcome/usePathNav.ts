import type { KeyboardEvent } from 'react';

/** Arrow keys, Home and End move the focus between the headers of the cards. */
export function onPathKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const target = e.target as HTMLElement;
  if (!target.hasAttribute('data-path-header')) return;
  const headers = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-path-header]')];
  const at = headers.indexOf(target);
  const next =
    e.key === 'ArrowDown' ? at + 1 : e.key === 'ArrowUp' ? at - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? headers.length - 1 : null;
  if (next === null || headers.length === 0) return;
  e.preventDefault();
  headers[(next + headers.length) % headers.length]?.focus();
}
