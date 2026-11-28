import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Engine } from './Engine';
import { wrap } from './messages';
import type { FromFrame, ToFrame } from './protocol';

let iframe: HTMLIFrameElement;
let sent: ToFrame[];

beforeEach(() => {
  iframe = document.createElement('iframe');
  document.body.append(iframe);
  sent = [];
  vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(((data: { msg: ToFrame }) => {
    sent.push(data.msg);
  }) as Window['postMessage']);
});
afterEach(() => vi.useRealTimers());

/** The frame says something to the view. */
function say(msg: FromFrame) {
  window.dispatchEvent(new MessageEvent('message', { data: wrap(msg), origin: location.origin, source: iframe.contentWindow }));
}
const result = (id: number): FromFrame => ({ type: 'search-result', id, cfi: 'c', fraction: 0.1, sectionLabel: null, pre: '', match: 'x', post: '' });

describe('Engine', () => {
  it('a_new_search_supersedes_the_old_one', async () => {
    const engine = new Engine(iframe);
    const seen: number[] = [];
    const first = engine.search('uno', (r) => seen.push(r.id), () => undefined);
    const second = engine.search('due', (r) => seen.push(r.id), () => undefined);
    // The old promise resolves at once; the new one waits for its own `search-done`.
    await first;
    let secondDone = false;
    void second.then(() => (secondDone = true));
    say(result(1));
    say(result(2));
    await Promise.resolve();
    expect(secondDone).toBe(false);
    say({ type: 'search-done', id: 1 });
    await Promise.resolve();
    expect(secondDone).toBe(false);
    say({ type: 'search-done', id: 2 });
    await second;
    expect(seen).toEqual([2]);
    expect(sent.filter((m) => m.type === 'search').map((m) => (m as { id: number }).id)).toEqual([1, 2]);
  });

  it('on_returns_an_unsubscribe', () => {
    const engine = new Engine(iframe);
    const fn = vi.fn();
    const off = engine.on('tap', fn);
    say({ type: 'tap', zone: 'start' });
    off();
    say({ type: 'tap', zone: 'end' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ type: 'tap', zone: 'start' });
  });

  it('close_resolves_when_the_frame_answers_closed', async () => {
    const engine = new Engine(iframe);
    let closed = false;
    const done = engine.close().then(() => (closed = true));
    await Promise.resolve();
    expect(sent).toEqual([{ type: 'close' }]);
    expect(closed).toBe(false);
    say({ type: 'closed' });
    await done;
    expect(closed).toBe(true);
  });

  it('close gives up waiting when the frame never answers', async () => {
    vi.useFakeTimers();
    const engine = new Engine(iframe);
    const done = engine.close();
    await vi.advanceTimersByTimeAsync(2500);
    await done;
  });

  it('open waits for ready, then resolves with the frame\'s answer', async () => {
    const engine = new Engine(iframe);
    const layout = {} as Parameters<Engine['open']>[3];
    const opened = engine.open(new Blob(['x']), 'a.epub', null, layout);
    await Promise.resolve();
    expect(sent).toEqual([]);
    say({ type: 'ready' });
    await engine.ready();
    await Promise.resolve();
    expect(sent.map((m) => m.type)).toEqual(['open']);
    const answer: FromFrame = { type: 'opened', toc: [], sectionFractions: [0, 1], sectionChars: [10], format: 'epub', title: 'T' };
    say(answer);
    await expect(opened).resolves.toEqual(answer);
  });

  it('open rejects with the error code of the frame', async () => {
    const engine = new Engine(iframe);
    say({ type: 'ready' });
    const opened = engine.open(new Blob(['x']), 'a.txt', null, {} as Parameters<Engine['open']>[3]);
    await engine.ready();
    await Promise.resolve();
    say({ type: 'error', code: 'unsupported_format' });
    await expect(opened).rejects.toMatchObject({ code: 'unsupported_format' });
  });

  it('ignores messages of another window', () => {
    const engine = new Engine(iframe);
    const fn = vi.fn();
    engine.on('tap', fn);
    window.dispatchEvent(new MessageEvent('message', { data: wrap({ type: 'tap', zone: 'start' }), origin: location.origin, source: window }));
    expect(fn).not.toHaveBeenCalled();
  });
});
