import { useState } from 'react';
import { useT } from '../../app/i18n';
import { apiErrorMessage } from '../../kit';
import { EMPTY_LEND, NAME_MAX, NOTES_MAX, toCreateBody, validateLend, type LendValues } from './loanModel';
import { useBorrowerChoices, useCreateLoan } from './useLoans';

/** The choices of the sheet; nothing is sent until `submit`, which checks the values first. */
export function useLendForm(bookId: string, onDone: () => void) {
  const t = useT();
  const create = useCreateLoan();
  const [values, setValues] = useState<LendValues>(EMPTY_LEND);
  const [checked, setChecked] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const choices = useBorrowerChoices(values.userId ? '' : values.name);

  const found = validateLend(values);
  const messages = checked
    ? Object.fromEntries(
        Object.entries(found).map(([field, key]) => [field, t(`mloans.lend.errors.${key}`, { max: key === 'notesLong' ? NOTES_MAX : NAME_MAX })]),
      )
    : {};

  const pickPerson = (id: string) => setValues((v) => ({ ...v, userId: v.userId === id ? '' : id, name: '' }));
  const setName = (name: string) => setValues((v) => ({ ...v, userId: '', name }));
  const setField = (field: 'due' | 'notes', value: string) => setValues((v) => ({ ...v, [field]: value }));

  const submit = async () => {
    if (create.isPending) return;
    setChecked(true);
    setFailure(null);
    if (Object.keys(found).length > 0) return;
    try {
      await create.mutateAsync(toCreateBody(bookId, values));
      onDone();
    } catch (e) {
      setFailure(apiErrorMessage(t, e));
    }
  };

  return { values, messages: messages as Partial<Record<'borrower' | 'due' | 'notes', string>>, failure, busy: create.isPending, choices, pickPerson, setName, setField, submit };
}
