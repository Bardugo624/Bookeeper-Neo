import { describe, expect, it } from 'vitest';
import { t as translate } from '@bookeeper/i18n';
import { book } from './testkit';
import { emptyForm, fromBook, toCreateBody, toPatchBody, validateBook } from './bookForm';

const t = (key: string, vars?: Record<string, string | number>) => translate('it', key, vars);

describe('create body', () => {
  it('leaves out every empty field', () => {
    expect(toCreateBody({ ...emptyForm(), title: '  Dune  ', authors: ['Frank Herbert', ' '], year: '1965' })).toEqual({
      title: 'Dune',
      authors: ['Frank Herbert'],
      published_year: 1965,
    });
  });
  it('turns price and date into the API units', () => {
    const body = toCreateBody({ ...emptyForm(), title: 'x', price: '12,5', acquired: '2024-03-02', isbn13: '978-88-452-9261-3' });
    expect(body.price_cents).toBe(1250);
    expect(body.isbn_13).toBe('9788845292613');
    expect(typeof body.acquired_at).toBe('number');
  });
});

describe('validation', () => {
  it('requires a title and enforces the core limits', () => {
    const e = validateBook(
      { ...emptyForm(), title: '', year: '2101', pages: '0', progressive: '2147483648', isbn13: '123', price: 'abc', subtitle: 'x'.repeat(301) },
      t,
    );
    for (const key of ['title', 'year', 'pages', 'progressive', 'isbn13', 'price', 'subtitle'] as const) expect(e[key]).toBeTruthy();
    expect(validateBook({ ...emptyForm(), title: 'x'.repeat(300) }, t)).toEqual({});
    expect(validateBook({ ...emptyForm(), title: 'ok', authors: Array(21).fill('a') }, t).authors).toBeTruthy();
  });
});

describe('patch body', () => {
  const stored = book(1, { title: 'Dune', authors: ['Herbert'], publisher: 'Nord', page_count: 500, isbn_13: '9788845292613' });
  it('is empty when nothing changed', () => {
    expect(toPatchBody(stored, fromBook(stored))).toEqual({});
  });
  it('holds only what changed, with null for a cleared field', () => {
    expect(toPatchBody(stored, { ...fromBook(stored), title: 'Dune II', publisher: '' })).toEqual({ title: 'Dune II', publisher: null });
  });
});
