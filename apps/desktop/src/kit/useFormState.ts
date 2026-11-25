import { useCallback, useRef, useState, type FormEvent } from 'react';

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export interface FormState<T> {
  values: T;
  errors: FormErrors<T>;
  touched: Partial<Record<keyof T, boolean>>;
  submitting: boolean;
  /** Error thrown by the last submit handler (for `apiErrorMessage`); null otherwise. */
  submitError: unknown;
  setValue<K extends keyof T>(name: K, value: T[K]): void;
  touch(name: keyof T): void;
  /** Puts server-side errors on fields. */
  setErrors(errors: FormErrors<T>): void;
  /** Returns a form `onSubmit` that validates, focuses the first invalid field and then runs `handler`. */
  submit(handler: (values: T) => Promise<void> | void): (event?: FormEvent) => Promise<void>;
  reset(): void;
}

function focusField(name: string): void {
  const el = document.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
  el?.focus();
}

/** Small form state: no library. Field order for focus is the order of keys in `initial`. */
export function useFormState<T extends object>(initial: T, validate: (values: T) => FormErrors<T>): FormState<T> {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const busy = useRef(false);
  const initialRef = useRef(initial);

  const setValue = useCallback(<K extends keyof T>(name: K, value: T[K]) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => (e[name] === undefined ? e : { ...e, [name]: undefined }));
  }, []);

  const touch = useCallback((name: keyof T) => setTouched((t) => ({ ...t, [name]: true })), []);

  const submit = useCallback(
    (handler: (values: T) => Promise<void> | void) => async (event?: FormEvent) => {
      event?.preventDefault();
      if (busy.current) return;
      const found = validate(values);
      const invalid = (Object.keys(initialRef.current) as Array<keyof T>).filter((k) => found[k]);
      setErrors(found);
      setTouched(Object.fromEntries(Object.keys(initialRef.current).map((k) => [k, true])) as Partial<Record<keyof T, boolean>>);
      if (invalid.length > 0) {
        focusField(String(invalid[0]));
        return;
      }
      busy.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        await handler(values);
      } catch (e) {
        setSubmitError(e);
      } finally {
        busy.current = false;
        setSubmitting(false);
      }
    },
    [validate, values],
  );

  const reset = useCallback(() => {
    setValues(initialRef.current);
    setErrors({});
    setTouched({});
    setSubmitError(null);
  }, []);

  return { values, errors, touched, submitting, submitError, setValue, touch, setErrors, submit, reset };
}
