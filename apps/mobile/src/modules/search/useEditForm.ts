import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router';
import { ApiError, type BookOut } from '@bookeeper/api';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { fieldOfMessage, fromBook, toPatch, validate, LIMITS, type EditErrors, type EditKey, type EditValues } from './editModel';
import { useUpdateBook } from './useBookEdit';

/** State, checks and the write of the "Modifica" page. `onSaved` runs after the write. */
export function useEditForm(book: BookOut, onSaved: () => void) {
  const t = useT();
  const update = useUpdateBook(book.id);
  const [values, setValues] = useState<EditValues>(() => fromBook(book));
  const [errors, setErrors] = useState<EditErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const done = useRef(false);

  const dirty = useMemo(() => Object.keys(toPatch(book, values)).length > 0, [book, values]);
  // Leaving by any road (back arrow, swipe, link) asks first, unless the save has just finished.
  const blocker = useBlocker(() => dirty && !done.current);

  const set = useCallback(<K extends EditKey>(key: K, value: EditValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] === undefined ? e : { ...e, [key]: undefined }));
    setFailure(null);
  }, []);

  const problems = (): EditErrors => {
    const text = (key: EditKey, problem: string): string => {
      if (problem === 'required') return t('msearch.edit.errors.required');
      if (problem === 'range') {
        const [min, max] = key === 'year' ? LIMITS.year : LIMITS.pages;
        return t('msearch.edit.errors.range', { min, max });
      }
      if (problem === 'tooMany') return t('msearch.edit.errors.tooMany', { max: LIMITS.authors });
      const max = key === 'title' ? LIMITS.title : key === 'authors' ? LIMITS.author : key === 'language' ? LIMITS.language : LIMITS.short;
      return t('msearch.edit.errors.tooLong', { max });
    };
    return Object.fromEntries(Object.entries(validate(values)).map(([key, p]) => [key, text(key as EditKey, p)]));
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const found = problems();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.querySelector<HTMLElement>(`[name="${Object.keys(found)[0]}"]`)?.focus();
      return;
    }
    const patch = toPatch(book, values);
    if (Object.keys(patch).length === 0) {
      done.current = true;
      return onSaved();
    }
    try {
      await update.mutateAsync(patch);
      done.current = true;
      onSaved();
    } catch (e) {
      const field = e instanceof ApiError && e.status === 422 ? fieldOfMessage(e.message) : null;
      if (field) {
        setErrors({ [field]: t('msearch.edit.errors.invalid') });
        document.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
      } else setFailure(apiErrorMessage(t, e));
    }
  };

  return { values, errors, failure, dirty, saving: update.isPending, set, submit, blocker };
}
