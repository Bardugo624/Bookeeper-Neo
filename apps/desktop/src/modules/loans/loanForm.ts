import type { CreateLoan, LoanOut, PatchLoan } from '@bookeeper/api';
import { toDateInputValue, toUnixSeconds, type FormErrors } from '../../kit';
import type { Translate } from '../../app';
import { borrowerLabel } from './loanStatus';

/** Limits of the core (`api/loans.rs`): borrower 1..120 characters, notes at most 10000. */
export const NAME_MAX = 120;
export const NOTES_MAX = 10_000;

export interface LoanFormValues {
  book_id: string;
  borrower_name: string;
  /** Set when the loan is to a person of the library. */
  borrower_user_id: string | null;
  lent_at: string;
  due_at: string;
  notes: string;
}

export function todayInput(now: Date = new Date()): string {
  return toDateInputValue(Math.floor(now.getTime() / 1000));
}

export function emptyValues(bookId: string, now?: Date): LoanFormValues {
  return { book_id: bookId, borrower_name: '', borrower_user_id: null, lent_at: todayInput(now), due_at: '', notes: '' };
}

export function valuesOf(loan: LoanOut, you?: Parameters<typeof borrowerLabel>[1]): LoanFormValues {
  return {
    book_id: loan.book_id,
    borrower_name: borrowerLabel(loan, you),
    borrower_user_id: loan.borrower_user_id ?? null,
    lent_at: toDateInputValue(loan.lent_at),
    due_at: loan.due_at == null ? '' : toDateInputValue(loan.due_at),
    notes: loan.notes ?? '',
  };
}

/** `loan` is the loan being edited: a returned one cannot be moved to a lending date after its return. */
export function validateLoan(
  t: Translate,
  loan?: LoanOut,
): (v: LoanFormValues) => FormErrors<LoanFormValues> {
  const returned = loan?.returned_at == null ? null : toDateInputValue(loan.returned_at);
  return (v) => {
    const errors: FormErrors<LoanFormValues> = {};
    if (!v.book_id) errors.book_id = t('loans.form.errors.book');
    const name = v.borrower_name.trim();
    if (v.borrower_user_id) {
      // A person of the library stands for the name: the server stores their current one.
    } else if (!name) errors.borrower_name = t('loans.form.errors.borrower');
    else if ([...name].length > NAME_MAX) errors.borrower_name = t('loans.form.errors.borrowerLong', { max: NAME_MAX });
    if (toUnixSeconds(v.lent_at) === null) errors.lent_at = t('loans.form.errors.lent');
    else if (returned && v.lent_at > returned) errors.lent_at = t('loans.form.errors.lentAfterReturn');
    if (v.due_at && toUnixSeconds(v.due_at) === null) errors.due_at = t('loans.form.errors.dueInvalid');
    // ISO dates compare as text; the core refuses a due date before the lending date.
    else if (v.due_at && !errors.lent_at && v.due_at < v.lent_at) errors.due_at = t('loans.form.errors.dueBefore');
    if ([...v.notes].length > NOTES_MAX) errors.notes = t('loans.form.errors.notesLong', { max: NOTES_MAX });
    return errors;
  };
}

export function toCreateBody(v: LoanFormValues): CreateLoan {
  const body: CreateLoan = { book_id: v.book_id, lent_at: toUnixSeconds(v.lent_at) };
  if (v.borrower_user_id) body.borrower_user_id = v.borrower_user_id;
  else body.borrower_name = v.borrower_name.trim();
  if (v.due_at) body.due_at = toUnixSeconds(v.due_at);
  if (v.notes.trim()) body.notes = v.notes.trim();
  return body;
}

/**
 * Edit sends the editable fields; an emptied due date or note clears it (`null`).
 * Dates the user did not touch are left out, so their stored time of day survives.
 * A changed date is sent as local noon, which on the same calendar day can fall on the
 * wrong side of a stored time the core compares in seconds (`check_dates`, the
 * `returned_at` check): the sent value is clamped to the stored bounds of that day, which
 * validation guarantees are not on an earlier (or later) day.
 */
export function toPatchBody(v: LoanFormValues, loan: LoanOut): PatchLoan {
  const initial = valuesOf(loan);
  const body: PatchLoan = { notes: v.notes.trim() ? v.notes.trim() : null };
  if (v.borrower_user_id) body.borrower_user_id = v.borrower_user_id;
  else {
    body.borrower_name = v.borrower_name.trim();
    // A free name takes the person off the loan.
    if (loan.borrower_user_id != null) body.borrower_user_id = null;
  }
  const lentChanged = v.lent_at !== initial.lent_at;
  const dueChanged = v.due_at !== initial.due_at;
  let lent = loan.lent_at;
  if (lentChanged) {
    lent = toUnixSeconds(v.lent_at) ?? loan.lent_at;
    if (!dueChanged && loan.due_at != null) lent = Math.min(lent, loan.due_at);
    if (loan.returned_at != null) lent = Math.min(lent, loan.returned_at);
    body.lent_at = lent;
  }
  if (dueChanged) {
    const due = v.due_at ? toUnixSeconds(v.due_at) : null;
    body.due_at = due == null ? null : Math.max(due, lent);
  }
  return body;
}
