import { describe, expect, it } from 'vitest';
import { isbn10To13, isbn13To10, isbnForms, parseIsbn } from './isbn';

describe('parseIsbn', () => {
  it('accepts ISBN-13 with or without hyphens and spaces', () => {
    expect(parseIsbn('9788845292613')).toEqual({ kind: 'isbn13', digits: '9788845292613' });
    expect(parseIsbn('978-88-452-9261-3')).toEqual({ kind: 'isbn13', digits: '9788845292613' });
    expect(parseIsbn(' 978 88 452 9261 3 ')?.digits).toBe('9788845292613');
  });
  it('accepts ISBN-10, including a final X', () => {
    expect(parseIsbn('8845292614')).toEqual({ kind: 'isbn10', digits: '8845292614' });
    expect(parseIsbn('0-8044-2957-X')).toEqual({ kind: 'isbn10', digits: '080442957X' });
    expect(parseIsbn('080442957x')?.digits).toBe('080442957X');
  });
  it('rejects a wrong check digit, a wrong length and letters', () => {
    expect(parseIsbn('9788845292614')).toBeNull();
    expect(parseIsbn('8845292615')).toBeNull();
    expect(parseIsbn('080442957')).toBeNull();
    expect(parseIsbn('97888452926AB')).toBeNull();
    expect(parseIsbn('')).toBeNull();
  });
});

describe('ISBN-10 and ISBN-13', () => {
  it('converts both ways with the check digits recomputed', () => {
    expect(isbn10To13('8845292614')).toBe('9788845292613');
    expect(isbn13To10('9788845292613')).toBe('8845292614');
    expect(isbn10To13('0-8044-2957-X')).toBe('9780804429573');
    expect(isbn13To10('978-0-8044-2957-3')).toBe('080442957X');
  });
  it('gives no ISBN-10 for the 979 prefix, and nothing for an invalid number', () => {
    expect(isbn13To10('9791032305690')).toBeNull();
    expect(isbn10To13('8845292615')).toBeNull();
    expect(isbn13To10('9788845292614')).toBeNull();
    expect(isbn10To13('9788845292613')).toBeNull();
  });
  it('lists the forms a book can be filed under', () => {
    expect(isbnForms('8845292614')).toEqual(['8845292614', '9788845292613']);
    expect(isbnForms('9788845292613')).toEqual(['9788845292613', '8845292614']);
    expect(isbnForms('9791032305690')).toEqual(['9791032305690']);
    expect(isbnForms('123')).toEqual([]);
  });
});
