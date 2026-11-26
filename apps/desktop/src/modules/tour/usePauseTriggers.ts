import { useEffect } from 'react';

export const CARD_ATTR = 'data-tour-card';
// What the target itself may open while the person uses it.
const PART_OF_USE = '[role="menu"], [role="listbox"]';

/**
 * Escape and a press anywhere else pause the tour. A press on the target, on the card, in what the
 * target opens, or in the dialog the target lives in is the person using the app, not leaving it.
 * Without a target on the page (another page) a press elsewhere is just navigation: no pause.
 * Escape is asked for (`pause`); a press elsewhere may be on the way to the step's action (`wander`).
 */
export function usePauseTriggers(active: boolean, target: Element | null, pause: () => void, wander: () => void = pause): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Escape belongs first to an open dialog or menu.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      pause();
    };
    const onDown = (e: PointerEvent) => {
      const node = e.target instanceof Element ? e.target : null;
      if (!node || !target || target.contains(node)) return;
      // The same anchor can sit on two buttons at once (e.g. a header and an empty state).
      const id = target.getAttribute('data-tour');
      if (id && node.closest(`[data-tour="${CSS.escape(id)}"]`)) return;
      if (node.closest(`[${CARD_ATTR}], ${PART_OF_USE}`)) return;
      if (target.closest('[role="dialog"]')?.contains(node)) return;
      wander();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [active, target, pause, wander]);
}
