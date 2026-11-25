import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type BookOut } from '@bookeeper/api';
import { useT } from '../../app';
import { useFormState } from '../../kit';
import {
  applyMetadata, emptyForm, fromBook, toCreateBody, toPatchBody, validateBook, type BookFormValues,
} from './bookForm';
import { useNextProgressive, type LookupOutcome } from './useIsbnLookup';
import { useBookWrites, type CoverPlan, type SaveResult } from './useBookWrites';

export interface UseBookEditor {
  form: ReturnType<typeof useFormState<BookFormValues>>;
  outcome: LookupOutcome | null;
  candidates: string[];
  plan: CoverPlan;
  setPlan(plan: CoverPlan): void;
  saving: boolean;
  /** Fills the form from a lookup (or leaves it empty with the ISBN typed in). */
  start(result: { isbn: string; outcome: LookupOutcome | null }): void;
  /** A form `onSubmit`; `another` keeps the panel open afterwards. */
  save(another: boolean): (event?: FormEvent) => Promise<void>;
}

/** State and writes of the "New book" / "Edit book" form. `onSaved` runs after a successful write. */
export function useBookEditor(
  book: BookOut | undefined,
  onSaved: (result: SaveResult | null, another: boolean) => void,
): UseBookEditor {
  const t = useT();
  const writes = useBookWrites();
  const initial = useMemo(() => (book ? fromBook(book) : emptyForm()), [book]);
  const validate = useCallback((v: BookFormValues) => validateBook(v, t), [t]);
  const form = useFormState(initial, validate);
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  const [plan, setPlan] = useState<CoverPlan>({ kind: 'keep' });
  const proposal = useNextProgressive(!book);
  const proposed = useRef(false);

  // The core proposes the next number; it never overwrites what the user already typed.
  const { setValue } = form;
  const typed = form.values.progressive;
  const next = proposal.data?.next;
  useEffect(() => {
    if (next === undefined || proposed.current) return;
    proposed.current = true;
    if (typed === '') setValue('progressive', String(next));
  }, [next, typed, setValue]);

  const start: UseBookEditor['start'] = ({ isbn, outcome: result }) => {
    setOutcome(result);
    const base = { ...form.values, isbn13: isbn.length === 13 ? isbn : '', isbn10: isbn.length === 10 ? isbn : '' };
    const filled = result?.kind === 'found' ? applyMetadata(base, result.metadata) : base;
    for (const key of Object.keys(filled) as Array<keyof BookFormValues>) {
      if (filled[key] !== form.values[key]) setValue(key, filled[key]);
    }
  };

  const save = (another: boolean) =>
    form.submit(async (values) => {
      try {
        if (book) {
          const patch = toPatchBody(book, values);
          // Nothing changed: nothing is sent.
          if (Object.keys(patch).length === 0 && plan.kind === 'keep') return onSaved(null, false);
          onSaved(await writes.update.mutateAsync({ id: book.id, patch, cover: plan }), false);
        } else {
          onSaved(await writes.create.mutateAsync({ body: toCreateBody(values), cover: plan }), another);
        }
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'progressive_taken')) throw e;
        form.setErrors({ progressive: t('books.form.errors.progressiveTaken') });
        document.querySelector<HTMLElement>('[name="progressive"]')?.focus();
      }
    });

  return {
    form,
    outcome,
    candidates: outcome?.kind === 'found' ? outcome.metadata.cover_candidates : [],
    plan,
    setPlan,
    saving: form.submitting,
    start,
    save,
  };
}
