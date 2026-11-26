import { CoachCard } from './CoachCard';
import { Spotlight } from './Spotlight';
import { tellStep } from './model';
import { useTour, useTourBinding } from './store';
import { usePauseTriggers } from './usePauseTriggers';
import { useReducedMotion } from './useReducedMotion';
import { useTarget } from './useTarget';
import { useTourStart } from './useTourStart';

/** Mounted once by the shell: the lamp and the card of the running tour. */
export function TourOverlay() {
  useTourBinding();
  useTourStart();
  const { status, current, step, total, pause, skip, note, clearNote } = useTour();
  const running = status === 'running' && current !== null;
  const target = useTarget(running ? current : null);
  const reduced = useReducedMotion();
  usePauseTriggers(running, target.el, pause);
  if (running && current) {
    return (
      <>
        <Spotlight rect={target.rect} reduced={reduced} />
        <CoachCard step={tellStep(current, target.anchorId)} index={step} total={total} target={target} onLater={pause} onSkip={skip} note={note} />
      </>
    );
  }
  // The path is over but there is something left to say (the first book has landed).
  if (note && status === 'done' && current) {
    return <CoachCard step={current} index={step} total={total} target={target} onLater={clearNote} onSkip={clearNote} note={note} closing />;
  }
  return null;
}
