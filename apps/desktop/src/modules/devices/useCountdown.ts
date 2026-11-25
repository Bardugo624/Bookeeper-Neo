import { useEffect, useState } from 'react';

/** Whole seconds left until `expiresAt` (unix seconds); 0 once past. Ticks every second. */
export function useCountdown(expiresAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return expiresAt === null ? 0 : Math.max(0, Math.ceil(expiresAt - now / 1000));
}
