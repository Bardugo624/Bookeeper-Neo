import { useState } from 'react';
import type { BookOut } from '@bookeeper/api';
import { useT } from '../../app';
import { apiErrorMessage } from '../../kit';
import { useClient } from '../../session';
import { useRefreshTags } from './useTags';

export type AssignMode = 'add' | 'remove';

export interface AssignFailure {
  book: BookOut;
  message: string;
}

export interface AssignResult {
  updated: number;
  /** Books that already were as asked: nothing was sent for them. */
  unchanged: number;
  failures: AssignFailure[];
}

/** Adds a tag to, or removes it from, many books: one request per book, one after the other. */
export function useAssignTags() {
  const t = useT();
  const client = useClient();
  const refresh = useRefreshTags();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<AssignResult | null>(null);

  const run = async (books: BookOut[], tagId: string, mode: AssignMode) => {
    if (progress) return;
    const outcome: AssignResult = { updated: 0, unchanged: 0, failures: [] };
    setProgress({ done: 0, total: books.length });
    for (const [i, book] of books.entries()) {
      const current = book.tags.map((tag) => tag.id);
      const has = current.includes(tagId);
      if (has === (mode === 'add')) {
        outcome.unchanged += 1;
      } else {
        const next = mode === 'add' ? [...current, tagId] : current.filter((id) => id !== tagId);
        try {
          await client.setBookTags(book.id, next);
          outcome.updated += 1;
        } catch (e) {
          outcome.failures.push({ book, message: apiErrorMessage(t, e) });
        }
      }
      setProgress({ done: i + 1, total: books.length });
    }
    await refresh();
    setProgress(null);
    setResult(outcome);
  };

  return { run, progress, result };
}
