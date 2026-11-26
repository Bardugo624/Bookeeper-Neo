import { useOverdueNotice } from './useOverdueNotice';

/** Draws nothing: keeps the daily overdue notification going while the shell is open. */
export function OverdueNotifier() {
  useOverdueNotice();
  return null;
}
