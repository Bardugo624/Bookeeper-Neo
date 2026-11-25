import { describe, expect, it } from 'vitest';
import { classifyCode, cleanIsbn, isValidIsbn10, isValidIsbn13, parseIsbn, toIsbn10, toIsbn13 } from './isbn';

describe('isbn', () => {
  it('checks the ISBN-13 check digit and the prefix', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('9780306406158')).toBe(false);
    expect(isValidIsbn13('9791090636071')).toBe(true);
    expect(isValidIsbn13('5901234123457')).toBe(false); // valid EAN-13, not a book
  });

  it('checks the ISBN-10 check digit, X included', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
    expect(isValidIsbn10('080442957X')).toBe(true);
    expect(isValidIsbn10('080442957Y')).toBe(false);
  });

  it('converts between the two forms', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157');
    expect(toIsbn10('9780306406157')).toBe('0306406152');
    expect(toIsbn13('080442957X')).toBe('9780804429573');
    expect(toIsbn10('9780804429573')).toBe('080442957X');
  });

  it('has no 10-digit form for the 979 prefix', () => {
    expect(toIsbn10('9791090636071')).toBeNull();
    expect(parseIsbn('979-10-90636-07-1')).toEqual({ isbn13: '9791090636071', isbn10: null });
  });

  it('parses either form, with hyphens and spaces', () => {
    const both = { isbn13: '9780306406157', isbn10: '0306406152' };
    expect(parseIsbn('978-0-306-40615-7')).toEqual(both);
    expect(parseIsbn(' 0 306 40615 2 ')).toEqual(both);
    expect(parseIsbn('0306406153')).toBeNull();
    expect(parseIsbn('')).toBeNull();
    expect(cleanIsbn('08-04429-57x')).toBe('080442957X');
  });

  it('tells a book from another barcode from a misread', () => {
    expect(classifyCode('9780306406157').kind).toBe('isbn');
    expect(classifyCode('5901234123457').kind).toBe('other');
    expect(classifyCode('9780306406158').kind).toBe('noise');
    expect(classifyCode('hello').kind).toBe('noise');
  });
});
