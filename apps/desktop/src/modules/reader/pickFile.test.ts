import { describe, expect, it } from 'vitest';
import { pickFile } from './pickFile';
import { file } from './testkit';

describe('which file the reader opens', () => {
  it('picks_the_epub_first', () => {
    const files = [file('p', 'pdf', 1), file('c', 'cbz', 1), file('m', 'mobi', 1), file('e', 'epub', 9)];
    expect(pickFile(files, null)?.id).toBe('e');
  });

  it('follows the order epub, mobi, azw3, fb2, cbz, pdf', () => {
    const order = ['epub', 'mobi', 'azw3', 'fb2', 'cbz', 'pdf'];
    for (let i = 0; i < order.length; i += 1) {
      const rest = order.slice(i).reverse().map((f) => file(f, f));
      expect(pickFile(rest, null)?.format).toBe(order[i]);
    }
  });

  it('takes the oldest of the same format', () => {
    expect(pickFile([file('new', 'epub', 20), file('old', 'epub', 5)], null)?.id).toBe('old');
  });

  it('skips files that are no longer on the server', () => {
    expect(pickFile([file('gone', 'epub', 1, { missing: true }), file('p', 'pdf', 2)], null)?.id).toBe('p');
    expect(pickFile([file('gone', 'epub', 1, { missing: true })], null)).toBeNull();
  });

  it('honours the file asked for, and falls back when it is unknown', () => {
    const files = [file('e', 'epub'), file('p', 'pdf')];
    expect(pickFile(files, 'p')?.id).toBe('p');
    expect(pickFile(files, 'zzz')?.id).toBe('e');
  });
});
