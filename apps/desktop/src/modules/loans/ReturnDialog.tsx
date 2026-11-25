import { useMemo } from 'react';
import type { LoanOut } from '@bookeeper/api';
import { Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, toDateInputValue, toUnixSeconds, useFormState } from '../../kit';
import { todayInput } from './loanForm';
import { useLoanMutations } from './useLoanMutations';

export interface ReturnDialogProps {
  loan: LoanOut;
  onClose(): void;
}

/** "Mark as returned": the date defaults to today and cannot precede the lending date. */
export function ReturnDialog({ loan, onClose }: ReturnDialogProps) {
  const t = useT();
  const { markReturned } = useLoanMutations();
  const lent = toDateInputValue(loan.lent_at);
  const validate = useMemo(
    () => (v: { returned_at: string }) => {
      if (toUnixSeconds(v.returned_at) === null) return { returned_at: t('loans.return.errors.required') };
      if (v.returned_at < lent) return { returned_at: t('loans.return.errors.before') };
      return {};
    },
    [t, lent],
  );
  const form = useFormState({ returned_at: todayInput() }, validate);
  const onSubmit = form.submit(async (v) => {
    await markReturned.mutateAsync({ id: loan.id, returnedAt: Math.max(toUnixSeconds(v.returned_at) ?? 0, loan.lent_at) });
    onClose();
  });
  return (
    <FormDialog
      open
      title={t('loans.return.title')}
      description={t('loans.return.description', { title: loan.book_title, name: loan.borrower_name })}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      submitLabel={t('loans.return.submit')}
      onSubmit={(e) => void onSubmit(e)}
      onCancel={onClose}
    >
      <Field label={t('loans.return.date')} error={form.errors.returned_at}>
        <Input
          name="returned_at"
          type="date"
          value={form.values.returned_at}
          onChange={(e) => form.setValue('returned_at', e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
