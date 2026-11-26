import type { Client } from '../../../session';
import type { LibraryIndex } from './types';

/**
 * Brings the stored index up to date. With the same version the server sends no entries and nothing is
 * rewritten. Returns whether the stored content changed.
 */
export async function syncIndex(client: Client, index: LibraryIndex, now: () => number = Date.now): Promise<boolean> {
  const stored = await index.meta();
  const answer = await client.isbnIndex(stored?.version);
  if (answer.unchanged && stored) return false;
  await index.replace(answer.version, answer.items, now());
  return true;
}
