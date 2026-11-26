import { useLayoutEffect, useRef, useState } from 'react';
import { resolveTarget, type TourContext, type TourStep } from './model';
import type { Rect } from './placement';

export interface Target {
  anchorId: string | null;
  el: Element | null;
  /** Viewport coordinates; `null` when the anchor is not on this page. */
  rect: Rect | null;
}

const NONE: Target = { anchorId: null, el: null, rect: null };

const selector = (id: string) => `[data-tour="${id.replace(/["\\]/g, '\\$&')}"]`;
function find(step: TourStep, seen: readonly string[]): Target {
  const ctx: TourContext = { has: (id) => document.querySelector(selector(id)) !== null, saw: (name) => seen.includes(name) };
  const anchorId = resolveTarget(step, ctx);
  const el = anchorId ? document.querySelector(selector(anchorId)) : null;
  if (!anchorId || !el) return { anchorId, el: null, rect: null };
  const r = el.getBoundingClientRect();
  // A box without size is a hidden element: the spotlight has nothing to light.
  if (r.width === 0 && r.height === 0) return { anchorId, el: null, rect: null };
  return { anchorId, el, rect: { x: r.x ?? r.left, y: r.y ?? r.top, width: r.width, height: r.height } };
}

function same(a: Target, b: Target): boolean {
  const p = a.rect;
  const q = b.rect;
  const rects = p === q || (!!p && !!q && p.x === q.x && p.y === q.y && p.width === q.width && p.height === q.height);
  return a.anchorId === b.anchorId && a.el === b.el && rects;
}

/**
 * Finds the step's anchor and keeps its box up to date: on resize, scroll (anywhere), size changes,
 * DOM changes and finished transitions, with at most one measurement per frame.
 */
export function useTarget(step: TourStep | null, seen: readonly string[] = []): Target {
  const [target, setTarget] = useState<Target>(NONE);
  const stepRef = useRef(step);
  stepRef.current = step;
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const observed = useRef<Element | null>(null);

  useLayoutEffect(() => {
    if (!step) {
      setTarget(NONE);
      return;
    }
    let frame = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;
    const measure = () => {
      const s = stepRef.current;
      if (!s) return;
      const next = find(s, seenRef.current);
      if (observed.current !== next.el && ro) {
        ro.disconnect();
        ro.observe(document.documentElement);
        if (next.el) ro.observe(next.el);
      }
      observed.current = next.el;
      setTarget((prev) => (same(prev, next) ? prev : next));
    };
    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    }
    measure();
    const mo = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    mo?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tour', 'hidden'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      mo?.disconnect();
      observed.current = null;
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
      document.removeEventListener('animationend', schedule, true);
    };
  }, [step, seen]);

  return target;
}
