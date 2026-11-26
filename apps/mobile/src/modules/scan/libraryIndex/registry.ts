import { idbIndex } from './idbIndex';
import { memoryIndex } from './memoryIndex';
import type { LibraryIndex } from './types';

export type IndexFactory = (libraryId: string) => LibraryIndex;

const defaultFactory: IndexFactory = (libraryId) =>
  typeof indexedDB === 'undefined' ? memoryIndex() : idbIndex(libraryId);

let factory: IndexFactory = defaultFactory;
const made = new Map<string, LibraryIndex>();

/** The index of a library: one instance per library for the whole run. */
export function libraryIndexFor(libraryId: string): LibraryIndex {
  let index = made.get(libraryId);
  if (!index) {
    index = factory(libraryId);
    made.set(libraryId, index);
  }
  return index;
}

/** Test hook: swaps how indexes are made (`undefined` restores the default) and forgets the ones made. */
export function setIndexFactoryForTest(next?: IndexFactory): void {
  factory = next ?? defaultFactory;
  made.clear();
}
