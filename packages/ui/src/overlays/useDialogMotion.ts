import { useEffect, useLayoutEffect, useState } from 'react';

const FALLBACK_MS = 280;
const FALLBACK_EASE = 'cubic-bezier(0.25, 1, 0.5, 1)';

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function canAnimate(el: HTMLElement): boolean {
  return typeof el.animate === 'function' && !reducedMotion();
}

/** `--bk-dur-slow` / `--bk-ease`, read from the panel so a theme can change them. */
function motionTokens(el: HTMLElement): { duration: number; easing: string } {
  const style = getComputedStyle(el);
  const raw = style.getPropertyValue('--bk-dur-slow').trim();
  const value = parseFloat(raw);
  const duration = Number.isFinite(value) ? (raw.endsWith('ms') ? value : value * 1000) : FALLBACK_MS;
  return { duration, easing: style.getPropertyValue('--bk-ease').trim() || FALLBACK_EASE };
}

/**
 * Motion of the open dialog panel (the one documented exception to "transform and opacity only" is
 * the height): the panel is born from `origin` and its height follows the content. Returns the ref
 * callback for the panel element. Without `animate`, `ResizeObserver` or with reduced motion
 * nothing moves.
 */
export function useDialogMotion(origin: HTMLElement | null | undefined, enabled = true) {
  const [panel, setPanel] = useState<HTMLElement | null>(null);

  // Born from the opener: from the centre of the button, small and transparent, to its place.
  useLayoutEffect(() => {
    if (!enabled || !panel || !origin || !canAnimate(panel)) return;
    const from = origin.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const { duration, easing } = motionTokens(panel);
    const scale = to.width > 0 && to.height > 0 ? Math.min(0.9, from.width / to.width, from.height / to.height) : 0.1;
    const anim = panel.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${Math.max(scale, 0.05)})`, opacity: 0 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ],
      { duration, easing },
    );
    return () => anim.cancel();
    // Only at birth of the panel: a later change of `origin` must not replay the flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  // The height follows the content, centred (the panel is centred with `translate`). The content
  // blocks tell a real change of content; the panel itself is watched too, so a height change with
  // no content change (the `max-height` cap moving with the window) only resyncs the stored height.
  useEffect(() => {
    if (!enabled || !panel || typeof ResizeObserver === 'undefined') return;
    let last = panel.offsetHeight;
    let running: Animation | null = null;
    const observer = new ResizeObserver((entries) => {
      if (entries.every((entry) => entry.target === panel)) {
        // Only the panel moved: its own animation (ignored) or the window cap (resync, no motion).
        if (!running) last = panel.offsetHeight;
        return;
      }
      // Mid-animation the visible height is the animated one: start from there, to the new target.
      const prev = running ? panel.offsetHeight : last;
      if (running) {
        const old = running;
        running = null;
        old.cancel();
      }
      const next = panel.offsetHeight;
      last = next;
      if (prev === next || prev === 0 || !canAnimate(panel)) return;
      const { duration, easing } = motionTokens(panel);
      const anim = panel.animate(
        [
          { height: `${prev}px`, overflow: 'hidden' },
          { height: `${next}px`, overflow: 'hidden' },
        ],
        { duration, easing },
      );
      running = anim;
      anim.addEventListener('finish', () => {
        if (running !== anim) return;
        running = null;
        last = panel.offsetHeight;
      });
      anim.addEventListener('cancel', () => {
        if (running === anim) running = null;
      });
    });
    const watched = new Set<Element>();
    const watch = () => {
      panel.querySelectorAll(':scope > header, :scope > footer, [data-dialog-content]').forEach((el) => {
        if (watched.has(el)) return;
        watched.add(el);
        observer.observe(el);
      });
    };
    observer.observe(panel);
    watch();
    // A body or footer that appears after opening is watched as it arrives: its first report
    // animates from the height before it.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(watch);
    mutations?.observe(panel, { childList: true });
    return () => {
      observer.disconnect();
      mutations?.disconnect();
      running?.cancel();
    };
  }, [panel, enabled]);

  return setPanel;
}
