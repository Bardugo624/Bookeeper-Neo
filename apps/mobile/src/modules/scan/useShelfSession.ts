import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BarcodeResult } from '../../platform';
import { useClient, useSession } from '../../session';
import { classifyCode, parseIsbn, type Isbn } from './isbn';
import { placeScanned, undoStep, type Created, type Target, type Typed } from './shelfFlow';
import { initialState, reduce, type Action, type SessionState } from './shelfReducer';

const NOTICE_MS = 2500;

/**
 * The session of filling one row: the reducer decides, this runs the network and keeps the clock.
 * State lives in a ref as well as in React, so two codes in the same tick still see each other.
 */
export function useShelfSession(target: Target) {
  const client = useClient();
  const queryClient = useQueryClient();
  const libraryId = useSession((s) => s.me?.library.id);
  const [state, setState] = useState<SessionState>(initialState);
  const [notice, setNotice] = useState(false);
  const ref = useRef(state);
  const created = useRef<Created>(new Set());
  const current = useRef<Isbn | null>(null);
  const typedRef = useRef<Typed | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const apply = useCallback((action: Action) => {
    ref.current = reduce(ref.current, action);
    setState(ref.current);
  }, []);

  const refresh = useCallback(() => {
    for (const key of [['books', libraryId], ['shelves', libraryId], ['scan', libraryId]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [libraryId, queryClient]);

  const run = useCallback(
    async (isbn: Isbn, typed?: Typed) => {
      try {
        const outcome = await placeScanned(client, target, isbn, created.current, typed);
        apply({ type: 'outcome', isbn: isbn.isbn13, outcome });
        if (outcome.kind === 'step') refresh();
      } catch {
        apply({ type: 'fail', isbn: isbn.isbn13 });
      }
    },
    [client, target, apply, refresh],
  );

  const take = useCallback(
    (isbn: Isbn): boolean => {
      const before = ref.current;
      apply({ type: 'read', code: isbn.isbn13, at: Date.now() });
      if (ref.current === before) return false;
      current.current = isbn;
      typedRef.current = undefined;
      void run(isbn);
      return true;
    },
    [apply, run],
  );

  const onCode = useCallback(
    (r: BarcodeResult) => {
      const code = classifyCode(r.text);
      if (code.kind === 'isbn') {
        take(code.isbn);
        return;
      }
      setNotice(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(false), NOTICE_MS);
    },
    [take],
  );

  /** Typed by hand; `false` when the text is not an ISBN. */
  const submitManual = useCallback(
    (text: string) => {
      const found = parseIsbn(text);
      if (found) take(found);
      return found !== null;
    },
    [take],
  );

  const retry = useCallback(() => {
    const isbn = current.current;
    if (!isbn || !ref.current.failed) return;
    apply({ type: 'retry' });
    void run(isbn, typedRef.current);
  }, [apply, run]);

  const giveTitle = useCallback(
    (typed: Typed) => {
      const isbn = current.current;
      if (!isbn) return;
      typedRef.current = typed;
      apply({ type: 'titled' });
      void run(isbn, typed);
    },
    [apply, run],
  );

  const skip = useCallback(() => {
    const isbn = current.current;
    if (isbn) apply({ type: 'skip', isbn: isbn.isbn13 });
  }, [apply]);

  const undo = useCallback(async () => {
    const step = ref.current.undo;
    if (!step || ref.current.busy) return;
    apply({ type: 'undo-start' });
    try {
      await undoStep(client, step, created.current);
      apply({ type: 'undo-done', at: Date.now() });
      refresh();
    } catch {
      apply({ type: 'undo-fail' });
    }
  }, [client, apply, refresh]);

  const finish = useCallback(() => apply({ type: 'finish' }), [apply]);

  return { state, notice, onCode, submitManual, retry, giveTitle, skip, undo, finish };
}
