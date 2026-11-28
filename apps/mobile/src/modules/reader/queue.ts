import { idbQueue, type OfflineQueue } from '@bookeeper/reader/data';

let queue: OfflineQueue | null = null;

/** The pending writes of the reader, in IndexedDB `bookeeper-reader`: they survive a restart. One for the whole app. */
export function readerQueue(): OfflineQueue {
  queue ??= idbQueue('bookeeper-reader');
  return queue;
}

/** Test hook: replaces the queue. */
export function setQueueForTest(next: OfflineQueue | null): void {
  queue = next;
}
