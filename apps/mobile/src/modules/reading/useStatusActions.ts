import type { BookOut, ReadingOut } from '@bookeeper/api';
import { statusBody, type ReadingStatus } from './readingModel';
import { useClearReading, useSetReading } from './useReading';

/** Changing or removing the state of one book; `error` is whichever of the two failed last. */
export function useStatusActions(book: BookOut, reading: ReadingOut | null) {
  const set = useSetReading(book.id, book.page_count);
  const clear = useClearReading(book.id);
  const reset = () => {
    set.reset();
    clear.reset();
  };
  return {
    error: set.error ?? clear.error,
    choose(status: ReadingStatus) {
      reset();
      if (reading?.status !== status) set.mutate(statusBody(reading, status));
    },
    clear() {
      reset();
      clear.mutate();
    },
  };
}

export type StatusActions = ReturnType<typeof useStatusActions>;
