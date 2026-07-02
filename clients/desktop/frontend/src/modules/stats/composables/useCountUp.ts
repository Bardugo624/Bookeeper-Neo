/**
 * useCountUp — anima un numero da 0 al valore corrente al primo render
 * (e ad ogni cambio di valore), con ease-out-quint su rAF.
 *
 * Rispetta prefers-reduced-motion: in quel caso il valore è immediato.
 * Ritorna una ref col valore da mostrare (già arrotondato).
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

const DURATION = 600; // ms — entrance, non feedback: può respirare
const easeOutQuint = (t: number) => 1 - Math.pow(1 - t, 5);

export function useCountUp(target: Ref<number>): Ref<number> {
  const display = ref(0);
  let raf = 0;

  const reduced =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animate(from: number, to: number) {
    cancelAnimationFrame(raf);
    if (reduced || from === to) {
      display.value = to;
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      display.value = Math.round(from + (to - from) * easeOutQuint(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  watch(target, (to, from) => animate(from ?? 0, to), { immediate: true });
  onBeforeUnmount(() => cancelAnimationFrame(raf));

  return display;
}
