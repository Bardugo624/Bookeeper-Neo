import type { IsbnEntry } from '@bookeeper/api';

export type IndexEntry = IsbnEntry;

export interface IndexMeta {
  /** Opaque fingerprint the server gave for the stored entries. */
  version: string;
  /** When the entries were stored, epoch milliseconds. */
  syncedAt: number;
}

/** The library's ISBNs kept on the phone, so a code can be answered without the network. */
export interface LibraryIndex {
  /** The entry for an ISBN-13; with two copies, the first. */
  get(isbn: string): Promise<IndexEntry | null>;
  /** Swaps the whole content in one step. */
  replace(version: string, items: IndexEntry[], syncedAt: number): Promise<void>;
  meta(): Promise<IndexMeta | null>;
}
