import type { CreateLoan, LoanOut } from '@bookeeper/api';

/** Writing loans needs the `member` role (guests only read). */
export const canLend = (role: string | undefined) => role === 'owner' || role === 'admin' || role === 'member';

/** Limits of the core (`api/loans.rs`): borrower 1..120 characters, notes at most 10000. */
export const NAME_MAX = 120;
export const NOTES_MAX = 10_000;

const DAY = 86_400;

/** The person's current name when the loan is to a member, else the name written on it. */
export const borrowerLabel = (loan: Pick<LoanOut, 'borrower' | 'borrower_name'>): string =>
  loan.borrower?.display_name ?? loan.borrower_name;

export const isMember = (loan: Pick<LoanOut, 'borrower' | 'borrower_user_id'>): boolean =>
  Boolean(loan.borrower ?? loan.borrower_user_id);

/** Open loans: overdue first (the oldest due date first), then by due date, the ones without last. */
export function sortActive(loans: readonly LoanOut[]): LoanOut[] {
  const rank = (l: LoanOut) => (l.overdue ? 0 : l.due_at == null ? 2 : 1);
  return [...loans].sort(
    (a, b) => rank(a) - rank(b) || (a.due_at ?? 0) - (b.due_at ?? 0) || b.lent_at - a.lent_at,
  );
}

/** Closed loans, the latest return first. */
export const sortReturned = (loans: readonly LoanOut[]): LoanOut[] =>
  [...loans].sort((a, b) => (b.returned_at ?? 0) - (a.returned_at ?? 0));

/** Whole days since the due date, at least 1 for a loan the core calls overdue. */
export function overdueDays(loan: Pick<LoanOut, 'due_at'>, nowSeconds: number): number {
  return Math.max(1, Math.floor((nowSeconds - (loan.due_at ?? nowSeconds)) / DAY));
}

/** `YYYY-MM-DD` read in the local time zone at noon, so the day never slips with the offset. */
export function toUnixSeconds(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return Math.floor(date.getTime() / 1000);
}

export function toDateInput(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface LendValues {
  /** A person of the library; empty when the name is free. */
  userId: string;
  name: string;
  due: string;
  notes: string;
}

export const EMPTY_LEND: LendValues = { userId: '', name: '', due: '', notes: '' };

export type LendErrorKey = 'borrower' | 'borrowerLong' | 'dueInvalid' | 'duePast' | 'notesLong';
export type LendErrors = Partial<Record<'borrower' | 'due' | 'notes', LendErrorKey>>;

export function validateLend(v: LendValues, now: Date = new Date()): LendErrors {
  const errors: LendErrors = {};
  const name = v.name.trim();
  if (!v.userId) {
    if (!name) errors.borrower = 'borrower';
    else if ([...name].length > NAME_MAX) errors.borrower = 'borrowerLong';
  }
  if (v.due) {
    if (toUnixSeconds(v.due) === null) errors.due = 'dueInvalid';
    else if (v.due < toDateInput(Math.floor(now.getTime() / 1000))) errors.due = 'duePast';
  }
  if ([...v.notes].length > NOTES_MAX) errors.notes = 'notesLong';
  return errors;
}

export function toCreateBody(bookId: string, v: LendValues): CreateLoan {
  const body: CreateLoan = { book_id: bookId };
  if (v.userId) body.borrower_user_id = v.userId;
  else body.borrower_name = v.name.trim();
  if (v.due) body.due_at = toUnixSeconds(v.due);
  if (v.notes.trim()) body.notes = v.notes.trim();
  return body;
}
