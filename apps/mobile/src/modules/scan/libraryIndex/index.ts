export type { IndexEntry, IndexMeta, LibraryIndex } from './types';
export { memoryIndex } from './memoryIndex';
export { idbIndex } from './idbIndex';
export { libraryIndexFor, setIndexFactoryForTest } from './registry';
export { syncIndex } from './sync';
