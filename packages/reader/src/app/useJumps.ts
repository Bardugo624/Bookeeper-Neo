import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine } from '../engine';
import type { Relocation, Target } from '../engine/protocol';
import { afterTurn, isExpired, jumpFrom, type Jump } from '../model';

/** «Torna al …»: every jump keeps where the person was; two turns forward from the new point let it go. */
export function useJumps(engine: Engine | null, relocation: Relocation | null) {
  const [jump, setJump] = useState<Jump | null>(null);
  const here = useRef(relocation);
  here.current = relocation;

  const goTo = useCallback(
    (target: Target) => {
      const at = here.current;
      if (at) setJump(jumpFrom({ cfi: at.cfi }, at.fraction * 100));
      engine?.goTo(target);
    },
    [engine],
  );
  const current = useRef(jump);
  current.current = jump;
  const back = useCallback(() => {
    const j = current.current;
    if (!j) return;
    setJump(null);
    engine?.goTo(j.target);
  }, [engine]);
  const turned = useCallback((direction: 'next' | 'prev') => {
    setJump((j) => {
      if (!j) return j;
      const n = afterTurn(j, direction);
      return isExpired(n) ? null : n;
    });
  }, []);
  // A different book starts clean.
  useEffect(() => () => setJump(null), [engine]);
  return { jump, goTo, back, turned };
}
