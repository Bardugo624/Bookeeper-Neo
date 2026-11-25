import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, type BookOut } from '@bookeeper/api';
import { useT } from '../../app';
import { useFormState } from '../../kit';
import {
  applyMetadata, emptyForm, fromBook, toCreateBody, toPatchBody, validateBook, type BookFormValues,
} from './bookFormModel';
import { useNextProgressive, useTypedIsbnDuplicate, type LookupOutcome } from './useIsbnLookup';
import { useBookWrites, type CoverPlan, type SaveResult } from './useBookWrites';

export interface UseBookEditor {
  form: ReturnType<typeof useFormState<BookFormValues>>;
  outcome: LookupOutcome | null;
  candidates: string[];
  plan: CoverPlan;
  setPlan(plan: CoverPlan): void;
  /** Placeholder color: the stored one until the user picks; null is "Automatic". */
  color: string | null;
  setColor(color: string | null): void;
  /** A book already in the library under the ISBN typed by hand, after the typing paused. */
  duplicate: BookOut | null;
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
  /** A cover is stored for `book`: only then can "Remove" delete anything. */
  hadCover = false,
): UseBookEditor {
  const t = useT();
  const writes = useBookWrites();
  const initial = useMemo(() => (book ? fromBook(book) : emptyForm()), [book]);
  const validate = useCallback((v: BookFormValues) => validateBook(v, t), [t]);
  const form = useFormState(initial, validate);
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  const [plan, setPlan] = useState<CoverPlan>({ kind: 'keep' });
  // `undefined` until the user picks a color: what is stored then stays as it is.
  const [picked, setColor] = useState<string | null | undefined>(undefined);
  const color = picked === undefined ? (book?.cover_color ?? null) : picked;
  // An ISBN typed by hand is checked against the library; one from the lookup already was.
  const duplicate = useTypedIsbnDuplicate(form.values.isbn13, form.values.isbn10, !book && outcome === null);
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
          if (picked !== undefined && picked !== (book.cover_color ?? null)) patch.cover_color = picked;
          const removesNothing = plan.kind === 'remove' && !hadCover;
          // Nothing changed: nothing is sent.
          if (Object.keys(patch).length === 0 && (plan.kind === 'keep' || removesNothing)) return onSaved(null, false);
          onSaved(await writes.update.mutateAsync({ id: book.id, patch, cover: plan, hadCover }), false);
        } else {
          onSaved(await writes.create.mutateAsync({ body: { ...toCreateBody(values), ...(color ? { cover_color: color } : {}) }, cover: plan }), another);
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
    color,
    setColor,
    duplicate,
    saving: form.submitting,
    start,
    save,
  };
}
