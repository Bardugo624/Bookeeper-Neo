import { describe, expect, it } from 'vitest';
import { parseIsbn } from './isbn';

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
