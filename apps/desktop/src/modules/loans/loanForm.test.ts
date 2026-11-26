import { describe, expect, it } from 'vitest';
import { toDateInputValue, toUnixSeconds } from '../../kit';
import { toPatchBody, validateLoan, valuesOf } from './loanForm';
import { DAY, loan } from './testkit';

const at = (y: number, m: number, d: number, h: number, min = 0) =>
  Math.floor(new Date(y, m - 1, d, h, min).getTime() / 1000);
const t = (key: string) => key;

describe('toPatchBody keeps changed dates on the right side of stored ones', () => {
  it('raises a same-day due date to the stored evening lending time', () => {
    const l = loan(1, { lent_at: at(2023, 11, 14, 22, 13) });
    const body = toPatchBody({ ...valuesOf(l), due_at: '2023-11-14' }, l);
    expect(body.lent_at).toBeUndefined();
    expect(body.due_at).toBe(l.lent_at);
  });

  it('sends a later due date as noon of its day', () => {
    const l = loan(1, { lent_at: at(2023, 11, 14, 22, 13) });
    const body = toPatchBody({ ...valuesOf(l), due_at: '2023-11-20' }, l);
    expect(body.due_at).toBe(toUnixSeconds('2023-11-20'));
  });

  it('lowers a lending date moved onto the day of a stored morning due date', () => {
    const l = loan(1, { lent_at: at(2023, 11, 10, 9), due_at: at(2023, 11, 14, 8) });
    const body = toPatchBody({ ...valuesOf(l), lent_at: '2023-11-14' }, l);
    expect(body.lent_at).toBe(l.due_at);
    expect(body.due_at).toBeUndefined();
  });

  it('lowers a lending date moved onto the day of a stored morning return', () => {
    const l = loan(1, { lent_at: at(2023, 11, 10, 9), returned_at: at(2023, 11, 14, 8) });
    const body = toPatchBody({ ...valuesOf(l), lent_at: '2023-11-14' }, l);
    expect(body.lent_at).toBe(l.returned_at);
  });

  it('sends both changed dates as noon', () => {
    const l = loan(1, { lent_at: at(2023, 11, 10, 22), due_at: at(2023, 11, 20, 8) });
    const body = toPatchBody({ ...valuesOf(l), lent_at: '2023-11-12', due_at: '2023-11-12' }, l);
    expect(body.lent_at).toBe(toUnixSeconds('2023-11-12'));
    expect(body.due_at).toBe(toUnixSeconds('2023-11-12'));
  });
});

describe('validateLoan on a returned loan', () => {
  const l = loan(1, { returned_at: 1_700_000_000 + 3 * DAY });
  const returnedDay = toDateInputValue(l.returned_at!);

  it('refuses a lending date after the return', () => {
    const next = toDateInputValue(l.returned_at! + DAY);
    expect(validateLoan(t, l)({ ...valuesOf(l), lent_at: next }).lent_at).toBe('loans.form.errors.lentAfterReturn');
  });

  it('accepts the day of the return', () => {
    expect(validateLoan(t, l)({ ...valuesOf(l), lent_at: returnedDay }).lent_at).toBeUndefined();
  });
});

describe('valuesOf names the caller', () => {
  it('puts the "you" label in the person field of a loan to the caller', () => {
    const l = loan(1, { borrower_user_id: 'u1', borrower: { id: 'u1', display_name: 'Anna' } });
    expect(valuesOf(l, { meId: 'u1', label: 'Tu' }).borrower_name).toBe('Tu');
    expect(valuesOf(l, { meId: 'u2', label: 'Tu' }).borrower_name).toBe('Anna');
  });
});
