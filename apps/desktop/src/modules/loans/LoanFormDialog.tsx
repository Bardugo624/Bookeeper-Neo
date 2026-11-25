import { useMemo, useState } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { Field, Input, Textarea } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { BorrowerInput } from './BorrowerInput';
import { BookPicker, type PickedBook } from './BookPicker';
import { emptyValues, toCreateBody, toPatchBody, validateLoan, valuesOf } from './loanForm';
import { useLoanMutations } from './useLoanMutations';
import styles from './LoanFormDialog.module.css';

export type LoanFormMode =
  /** A new loan; with `book` the book is fixed and the picker is not shown. */
  | { kind: 'create'; book?: PickedBook }
  | { kind: 'edit'; loan: LoanOut };

export interface LoanFormDialogProps {
  mode: LoanFormMode;
  onClose(): void;
}

/** "New loan" and "Edit loan". Mount it only while open: every opening starts from a clean form. */
export function LoanFormDialog({ mode, onClose }: LoanFormDialogProps) {
  const t = useT();
  const { create, update } = useLoanMutations();
  const editing = mode.kind === 'edit';
  const fixedBook = mode.kind === 'create' ? (mode.book ?? null) : null;
  const [picked, setPicked] = useState<PickedBook | null>(fixedBook);
  const editedLoan = mode.kind === 'edit' ? mode.loan : undefined;
  const validate = useMemo(() => validateLoan(t, editedLoan), [t, editedLoan]);
  const form = useFormState(editing ? valuesOf(mode.loan) : emptyValues(fixedBook?.id ?? ''), validate);
  const { values, errors } = form;

  const choose = (book: PickedBook | null) => {
    setPicked(book);
    form.setValue('book_id', book?.id ?? '');
  };
  const onSubmit = form.submit(async (v) => {
    if (mode.kind === 'edit') await update.mutateAsync({ id: mode.loan.id, patch: toPatchBody(v, mode.loan) });
    else await create.mutateAsync(toCreateBody(v));
    onClose();
  });

  const bookTitle = editing ? mode.loan.book_title : fixedBook?.title;
  const description = bookTitle ? t('loans.form.forBook', { title: bookTitle }) : undefined;
  const error = form.submitError
    ? apiErrorMessage(t, form.submitError, { book_already_lent: t('loans.errors.alreadyLent') })
    : null;

  return (
    <FormDialog
      open
      title={t(editing ? 'loans.edit.title' : 'loans.new.title')}
      description={description}
      error={error}
      busy={form.submitting}
      submitLabel={t(editing ? 'common.save' : 'loans.new.submit')}
      onSubmit={(e) => void onSubmit(e)}
      onCancel={onClose}
    >
      {!editing && !fixedBook ? <BookPicker value={picked} error={errors.book_id} onChange={choose} /> : null}
      <Field label={t('loans.form.borrower')} error={errors.borrower_name}>
        <BorrowerInput value={values.borrower_name} onChange={(name) => form.setValue('borrower_name', name)} />
      </Field>
      <div className={styles.dates}>
        <Field label={t('loans.form.lentAt')} error={errors.lent_at}>
          <Input name="lent_at" type="date" value={values.lent_at} onChange={(e) => form.setValue('lent_at', e.target.value)} />
        </Field>
        <Field label={t('loans.form.dueAt')} description={t('loans.form.dueHint')} error={errors.due_at}>
          <Input name="due_at" type="date" value={values.due_at} onChange={(e) => form.setValue('due_at', e.target.value)} />
        </Field>
      </div>
      <Field label={t('loans.form.notes')} error={errors.notes}>
        <Textarea name="notes" rows={3} value={values.notes} onChange={(e) => form.setValue('notes', e.target.value)} />
      </Field>
    </FormDialog>
  );
}
