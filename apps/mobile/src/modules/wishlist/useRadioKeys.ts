import { useRef, type KeyboardEvent } from 'react';

/** Arrow keys move through a radio group and select, as the pattern asks; only the checked radio is in the tab order. */
export function useRadioKeys(count: number, selected: number, select: (index: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (index + step + count) % count;
    select(next);
    refs.current[next]?.focus();
  };
  const props = (index: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      refs.current[index] = el;
    },
    tabIndex: index === selected || (selected < 0 && index === 0) ? 0 : -1,
    onKeyDown: (e: KeyboardEvent) => onKeyDown(e, index),
  });
  return props;
}
