import { useEffect, useRef } from 'react';

/** Calls `onDone` after `duration` ms of un-paused time. Pausing keeps the remaining time. */
export function useAutoDismiss(duration: number, paused: boolean, onDone: () => void): void {
  const remaining = useRef(duration);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timer = setTimeout(() => done.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused]);
}
