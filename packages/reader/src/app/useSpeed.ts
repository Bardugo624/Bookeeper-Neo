import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Engine } from '../engine';
import type { Relocation } from '../engine/protocol';
import { INITIAL_SPEED, SPEED_KEY, minutesLeft, recordTurn, type SpeedState } from '../model';
import type { Opened } from './useBookSession';

function load(): SpeedState {
  try {
    const v = JSON.parse(window.localStorage.getItem(SPEED_KEY) ?? 'null') as Partial<SpeedState> | null;
    if (v && typeof v.charsPerMinute === 'number' && typeof v.measuredMs === 'number') {
      return { charsPerMinute: v.charsPerMinute, measuredMs: v.measuredMs };
    }
  } catch {
    // Starts again.
  }
  return INITIAL_SPEED;
}

/**
 * The reading speed of this device and the minutes left. A page counts when the person turned forward
 * (`turn.current` is `next`) and the pages kept 2 seconds to 3 minutes; the times show after 3 measured minutes.
 */
export function useSpeed(
  engine: Engine | null,
  opened: Opened | null,
  relocation: Relocation | null,
  turn: RefObject<'next' | 'prev' | null>,
  onPageSpan: (fraction: number) => void,
): { chapter: number | null; book: number | null } {
  const [speed, setSpeed] = useState<SpeedState>(load);
  const last = useRef<{ fraction: number; at: number } | null>(null);
  const total = useMemo(() => (opened ? opened.sectionChars.reduce((a, b) => a + b, 0) : 0), [opened]);
  const spanRef = useRef(onPageSpan);
  spanRef.current = onPageSpan;

  useEffect(() => {
    if (!engine) return;
    return engine.on('relocate', ({ at }) => {
      const now = Date.now();
      const before = last.current;
      const direction = turn.current;
      turn.current = null;
      last.current = { fraction: at.fraction, at: now };
      if (direction !== 'next' || !before || at.fraction <= before.fraction) return;
      spanRef.current(at.fraction - before.fraction);
      setSpeed((s) => {
        const next = recordTurn(s, (at.fraction - before.fraction) * total, now - before.at);
        if (next !== s) {
          try {
            window.localStorage.setItem(SPEED_KEY, JSON.stringify(next));
          } catch {
            // Not kept.
          }
        }
        return next;
      });
    });
  }, [engine, total, turn]);

  if (!opened || !relocation) return { chapter: null, book: null };
  const sectionChars = opened.sectionChars[relocation.sectionIndex] ?? 0;
  return {
    chapter: minutesLeft(speed, sectionChars * (1 - relocation.sectionFraction)),
    book: minutesLeft(speed, total * (1 - relocation.fraction)),
  };
}
