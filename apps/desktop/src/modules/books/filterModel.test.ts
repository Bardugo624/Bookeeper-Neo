import { describe, expect, it } from 'vitest';
import { NO_FILTERS, parseFilters, parseSort, serializeView, toApiFilters, writeFilters } from './filterModel';

const parse = (s: string) => parseFilters(new URLSearchParams(s));

describe('filter model', () => {
  it('reads every parameter of the address', () => {
    const f = parse(
      'reading=read&tag=a&tag=b&room=r1&shelf=s1&genre=Giallo&language=it&format=ebook&year_from=1990&year_to=2000&acquired_from=2024-01-05&acquired_to=2024-02-10&on_loan=true&owner=me',
    );
    expect(f).toEqual({
      reading: 'read',
      onLoan: true,
      unshelved: false,
      tags: ['a', 'b'],
      room: 'r1',
      shelf: 's1',
      genre: 'Giallo',
      language: 'it',
      format: 'ebook',
      yearFrom: 1990,
      yearTo: 2000,
      acquiredFrom: '2024-01-05',
      acquiredTo: '2024-02-10',
      owner: 'me',
    });
  });

  it('goes address → state → address → state unchanged', () => {
    const f = parse('reading=abandoned&tag=b&tag=a&room=r1&year_from=1990&acquired_to=2024-02-10&filter=unshelved');
    const p = new URLSearchParams();
    writeFilters(p, f);
    expect(parseFilters(p)).toEqual(f);
  });

  it('ignores invalid values without failing', () => {
    expect(parse('reading=zzz&year_from=abc&year_to=-3&acquired_from=2024-13-40&acquired_to=ieri&tag=&sort=x&on_loan=1')).toEqual(NO_FILTERS);
    expect(parseSort('bogus')).toBeNull();
    expect(parseSort('year')).toBe('published_year');
  });

  it('reads the older filter=loan as a loan filter and writes on_loan', () => {
    const f = parse('filter=loan');
    expect(f.onLoan).toBe(true);
    const p = new URLSearchParams('filter=loan');
    writeFilters(p, f);
    expect(p.toString()).toBe('on_loan=true');
  });

  it('maps the filters to API parameters, the last day included', () => {
    const api = toApiFilters(parse('tag=a&tag=b&room=r1&shelf=s2&acquired_from=2024-03-01&acquired_to=2024-03-01'));
    expect(api.tag_id).toEqual(['a', 'b']);
    expect(api.room_id).toBe('r1');
    expect(api.shelf_id).toBe('s2');
    expect(api.acquired_to! - api.acquired_from!).toBeGreaterThan(23 * 3600 - 1);
    expect(api.acquired_to! - api.acquired_from!).toBeLessThanOrEqual(25 * 3600);
    expect(toApiFilters(NO_FILTERS)).toEqual(Object.fromEntries(Object.keys(toApiFilters(NO_FILTERS)).map((k) => [k, undefined])));
  });

  it('serializes a view without the defaults', () => {
    expect(serializeView({ q: ' dune ', filters: parse('reading=read'), sort: 'created_at', order: 'desc' })).toBe('q=dune&reading=read&sort=created_at');
    expect(serializeView({ q: '', filters: NO_FILTERS, sort: 'title', order: 'desc' })).toBe('sort=title&order=desc');
  });

  it('ignores address values the API would refuse', () => {
    expect(parse('format=xyz').format).toBeNull();
    const inverted = parse('year_from=2000&year_to=1990&acquired_from=2024-03-01&acquired_to=2024-01-01');
    expect([inverted.yearFrom, inverted.yearTo, inverted.acquiredFrom, inverted.acquiredTo]).toEqual([null, null, null, null]);
    const many = parse(Array.from({ length: 12 }, (_, i) => `tag=t${i}`).join('&'));
    expect(many.tags).toHaveLength(10);
    const both = parse('filter=unshelved&shelf=s1');
    expect([both.unshelved, both.shelf]).toEqual([true, null]);
  });

  it('never sends a combination the API refuses', () => {
    const api = toApiFilters({ ...NO_FILTERS, unshelved: true, shelf: 's1', format: 'x', yearFrom: 5, yearTo: 1 });
    expect(api.shelf_id).toBeUndefined();
    expect(api.format).toBeUndefined();
    expect(api.year_from).toBeUndefined();
  });
});
