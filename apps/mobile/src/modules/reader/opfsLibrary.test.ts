import { describe, expect, it } from 'vitest';
import { streamOf } from './opfsLibrary';
import { fakeLibrary } from './opfsTestkit';

const meta = { sha256: 'abc', format: 'epub', name: 'dune.epub', bookId: 'b1', fileId: 'f1', sizeBytes: 10 };
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const text = (blob: Blob) =>
  new Promise<number[]>((ok) => {
    const r = new FileReader();
    r.onload = () => ok([...new Uint8Array(r.result as ArrayBuffer)]);
    r.readAsArrayBuffer(blob);
  });

describe('the library on the phone', () => {
  it('save_open_and_remove', async () => {
    const { library, files, persist } = fakeLibrary();
    expect(await library.has('abc')).toBe(false);
    expect(await library.open('abc')).toBeNull();
    await library.save(meta, streamOf(bytes, 4), () => {}, new AbortController().signal);
    expect(await library.has('abc')).toBe(true);
    expect([...files.keys()]).toEqual(['abc.epub']);
    expect(await text((await library.open('abc'))!)).toEqual([...bytes]);
    expect(await library.list()).toMatchObject([{ sha256: 'abc', name: 'dune.epub', sizeBytes: 10 }]);
    expect(await library.usage()).toEqual({ count: 1, bytes: 10 });
    // Asks the browser to keep the data, once.
    await library.save({ ...meta, sha256: 'def' }, streamOf(bytes), () => {}, new AbortController().signal);
    expect(persist).toHaveBeenCalledTimes(1);
    await library.remove('abc');
    expect(await library.has('abc')).toBe(false);
    expect(files.has('abc.epub')).toBe(false);
    expect(await library.open('abc')).toBeNull();
  });

  it('an_aborted_save_leaves_nothing', async () => {
    const { library, files } = fakeLibrary();
    const ctl = new AbortController();
    await expect(library.save(meta, streamOf(bytes, 2), (f) => f >= 0.4 && ctl.abort(), ctl.signal)).rejects.toBeDefined();
    expect(files.size).toBe(0);
    expect(await library.list()).toEqual([]);
    expect(await library.has('abc')).toBe(false);
    // A failing stream is the same.
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.subarray(0, 3));
      },
      pull() {
        throw new Error('network');
      },
    });
    await expect(library.save(meta, broken, () => {}, new AbortController().signal)).rejects.toThrow('network');
    expect(files.size).toBe(0);
    expect(await library.list()).toEqual([]);
  });

  it('progress_is_reported', async () => {
    const { library } = fakeLibrary();
    const seen: number[] = [];
    await library.save(meta, streamOf(bytes, 4), (f) => seen.push(f), new AbortController().signal);
    expect(seen).toEqual([0.4, 0.8, 1, 1]);
  });

  it('a_second_save_of_a_kept_book_changes_nothing_even_when_cancelled', async () => {
    const { library, files } = fakeLibrary();
    await library.save(meta, streamOf(bytes, 4), () => {}, new AbortController().signal);
    const ctl = new AbortController();
    ctl.abort();
    await library.save(meta, streamOf(bytes, 4), () => {}, ctl.signal).catch(() => undefined);
    expect(files.has('abc.epub')).toBe(true);
    expect(await library.has('abc')).toBe(true);
  });

  it('a_file_left_by_a_closed_tab_is_swept_at_the_next_save', async () => {
    const { library, files } = fakeLibrary();
    files.set('old.epub', new Uint8Array());
    await library.save(meta, streamOf(bytes, 4), () => {}, new AbortController().signal);
    expect([...files.keys()]).toEqual(['abc.epub']);
  });
});
