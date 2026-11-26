import { CoachCard } from './CoachCard';
import { Spotlight } from './Spotlight';
import { useTour, useTourBinding } from './store';
import { usePauseTriggers } from './usePauseTriggers';
import { useReducedMotion } from './useReducedMotion';
import { useTarget } from './useTarget';

/** Mounted once by the shell: the lamp and the card of the running tour. */
export function TourOverlay() {
  useTourBinding();
  const { status, current, step, total, pause, skip } = useTour();
  const running = status === 'running' && current !== null;
  const target = useTarget(running ? current : null);
  const reduced = useReducedMotion();
  usePauseTriggers(running, target.el, pause);
  if (!running || !current) return null;
  return (
    <>
      <Spotlight rect={target.rect} reduced={reduced} />
      <CoachCard step={current} index={step} total={total} target={target} onLater={pause} onSkip={skip} />
    </>
  );
}
