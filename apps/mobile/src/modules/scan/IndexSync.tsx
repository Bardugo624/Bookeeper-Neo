import { useIndexSync } from './useIndexSync';

/** The module's `background`: keeps the phone's copy of the library's ISBNs fresh. Draws nothing. */
export function IndexSync() {
  useIndexSync();
  return null;
}
