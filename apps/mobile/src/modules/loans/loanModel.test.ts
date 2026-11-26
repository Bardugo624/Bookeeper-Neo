import { describe, expect, it } from 'vitest';
import { toCreateBody } from './loanModel';

describe('toCreateBody', () => {
  it('sends the due date as the end of the chosen day, local time', () => {
    const body = toCreateBody('b1', { userId: '', name: 'Ada', due: '2030-05-06', notes: '' });
    const d = new Date((body.due_at as number) * 1000);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([2030, 4, 6, 23, 59, 59]);
  });
});
