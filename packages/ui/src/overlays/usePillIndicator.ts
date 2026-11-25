import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export interface IndicatorBox {
  x: number;
  width: number;
}

/**
 * Measures the active tab (on mount, on `activeId` change and whenever the list or the tab
 * resizes) so that a single indicator element can follow it.
 */
export function usePillIndicator(listRef: RefObject<HTMLElement | null>, activeId: string | undefined) {
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const [ready, setReady] = useState(false);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const measure = () => {
      const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) {
        setBox(null);
        return;
      }
      setBox((prev) =>
        prev && prev.x === tab.offsetLeft && prev.width === tab.offsetWidth
          ? prev
          : { x: tab.offsetLeft, width: tab.offsetWidth },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [listRef, activeId]);

  // Enable the slide only after the first placement, so the indicator does not fly in from 0.
  useEffect(() => {
    if (!box || ready) return undefined;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [box, ready]);

  return { box, ready };
}
