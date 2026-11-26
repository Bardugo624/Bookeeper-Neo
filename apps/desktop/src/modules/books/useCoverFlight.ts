import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookOut } from '@bookeeper/api';

/** The cover the dialog showed at the moment of saving: a copy of it, and where it was on screen. */
export interface CoverHandoff {
  node: HTMLElement;
  rect: DOMRect;
}

/** Copies the cover shown inside `preview` (a wrapper of the cover) with its position; null when it is not there. */
export function captureCover(preview: HTMLElement | null): CoverHandoff | null {
  const cover = preview?.firstElementChild;
  if (!(cover instanceof HTMLElement)) return null;
  const rect = cover.getBoundingClientRect();
  return { node: cover.cloneNode(true) as HTMLElement, rect };
}

const WAIT_FOR_CARD = 1500;
const FLIGHT_MS = 420;
const FADE_MS = 200;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const token = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

interface Flight {
  id: string;
  node: HTMLElement;
  rect: DOMRect;
  timer?: number;
  animation?: Animation;
  card?: HTMLElement;
}

const inView = (r: DOMRect) =>
  r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;

/**
 * The cover of a book just created flies from where the dialog showed it to the book's card in the grid.
 * Position and size are a `transform` (Web Animations); at the end the copy goes and the real cover stays.
 * When the card is not on screen (table view, filtered out, beyond the loaded rows) the copy fades away and
 * the page does not scroll. Nothing blocks the grid; a new flight cancels the one in progress.
 */
export function useCoverFlight(books: BookOut[]) {
  const current = useRef<Flight | null>(null);
  const [tick, setTick] = useState(0);

  const end = useCallback(() => {
    const flight = current.current;
    if (!flight) return;
    current.current = null;
    window.clearTimeout(flight.timer);
    flight.animation?.cancel();
    flight.node.remove();
    if (flight.card) flight.card.style.visibility = '';
  }, []);

  const start = useCallback(
    (id: string, cover: CoverHandoff) => {
      end();
      if (reducedMotion() || typeof cover.node.animate !== 'function') return;
      const { node, rect } = cover;
      Object.assign(node.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        margin: '0',
        zIndex: 'var(--bk-z-toast)',
        pointerEvents: 'none',
        transformOrigin: 'top left',
      });
      node.setAttribute('aria-hidden', 'true');
      node.dataset.coverFlight = '';
      document.body.append(node);
      current.current = { id, node, rect };
      setTick((n) => n + 1);
    },
    [end],
  );

  useEffect(() => {
    const flight = current.current;
    if (!flight || flight.animation) return;
    const { node, rect } = flight;
    const finish = () => {
      if (current.current === flight) end();
    };
    const fade = () => {
      flight.animation = node.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-16px)' },
        ],
        { duration: FADE_MS, easing: token('--bk-ease', 'ease-out'), fill: 'forwards' },
      );
      flight.animation.onfinish = finish;
      flight.animation.oncancel = finish;
    };
    const target = document.querySelector<HTMLElement>(`[data-book-cover="${CSS.escape(flight.id)}"]`);
    const to = target?.getBoundingClientRect();
    if (target && to && inView(to)) {
      window.clearTimeout(flight.timer);
      flight.card = target;
      target.style.visibility = 'hidden';
      const scale = rect.width > 0 ? to.width / rect.width : 1;
      flight.animation = node.animate(
        [
          { transform: 'translate(0px, 0px) scale(1)' },
          { transform: `translate(${to.left - rect.left}px, ${to.top - rect.top}px) scale(${scale})` },
        ],
        { duration: FLIGHT_MS, easing: token('--bk-ease', 'ease-out'), fill: 'forwards' },
      );
      flight.animation.onfinish = finish;
      flight.animation.oncancel = finish;
    } else if (books.some((b) => b.id === flight.id)) {
      // The book is loaded but its card is not on screen: no scrolling, the copy just leaves.
      window.clearTimeout(flight.timer);
      fade();
    } else if (flight.timer === undefined) {
      flight.timer = window.setTimeout(() => {
        if (current.current === flight && !flight.animation) fade();
      }, WAIT_FOR_CARD);
    }
  }, [books, tick, end]);

  useEffect(() => end, [end]);

  return { start };
}
