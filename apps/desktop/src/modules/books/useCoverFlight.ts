import { useCallback, useEffect, useRef, useState } from "react";

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

const FLIGHT_MS = 420;
const FADE_MS = 200;

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
const token = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

interface Flight {
  id: string;
  node: HTMLElement;
  rect: DOMRect;
  animation?: Animation;
  card?: HTMLElement;
  /** Runs when the cover has landed (or left). */
  landed?: () => void;
}

const inView = (r: DOMRect) =>
  r.width > 0 &&
  r.bottom > 0 &&
  r.right > 0 &&
  r.top < window.innerHeight &&
  r.left < window.innerWidth;

/**
 * The cover of a book just created flies from where the dialog showed it to the book's card in the grid.
 * Position and size are a `transform` (Web Animations); at the end the copy goes and the real cover stays.
 * When the card is not on screen (table view, filtered out, beyond the loaded rows) the copy fades away and
 * the page does not scroll. Nothing blocks the grid; a new flight cancels the one in progress.
 */
export function useCoverFlight() {
  const current = useRef<Flight | null>(null);
  const [tick, setTick] = useState(0);

  const end = useCallback(() => {
    const flight = current.current;
    if (!flight) return;
    current.current = null;
    flight.animation?.cancel();
    flight.node.remove();
    if (flight.card) flight.card.style.visibility = "";
    flight.landed?.();
  }, []);

  const start = useCallback(
    (id: string, cover: CoverHandoff, landed?: () => void) => {
      end();
      if (reducedMotion() || typeof cover.node.animate !== "function") {
        landed?.();
        return;
      }
      const { node, rect } = cover;
      Object.assign(node.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        margin: "0",
        zIndex: "var(--bk-z-toast)",
        pointerEvents: "none",
        transformOrigin: "top left",
      });
      node.setAttribute("aria-hidden", "true");
      node.dataset.coverFlight = "";
      document.body.append(node);
      current.current = { id, node, rect, landed };
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
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(-16px)" },
        ],
        {
          duration: FADE_MS,
          easing: token("--bk-ease", "ease-out"),
          fill: "forwards",
        },
      );
      flight.animation.onfinish = finish;
      flight.animation.oncancel = finish;
    };
    const target = document.querySelector<HTMLElement>(
      `[data-book-cover="${CSS.escape(flight.id)}"]`,
    );
    const to = target?.getBoundingClientRect();
    if (target && to && inView(to)) {
      flight.card = target;
      target.style.visibility = "hidden";
      const scale = rect.width > 0 ? to.width / rect.width : 1;
      flight.animation = node.animate(
        [
          { transform: "translate(0px, 0px) scale(1)" },
          {
            transform: `translate(${to.left - rect.left}px, ${to.top - rect.top}px) scale(${scale})`,
          },
        ],
        {
          duration: FLIGHT_MS,
          easing: token("--bk-ease", "ease-out"),
          fill: "forwards",
        },
      );
      flight.animation.onfinish = finish;
      flight.animation.oncancel = finish;
    } else {
      // The list is already final when the flight starts (the creation waits for the refresh): a card that is
      // not on screen will not show up later. No scrolling, the copy just leaves.
      fade();
    }
    // A scroll during the flight would move the card away from the measured landing point: stop cleanly.
    const onScroll = () => finish();
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, [tick, end]);

  useEffect(() => end, [end]);

  return { start };
}
