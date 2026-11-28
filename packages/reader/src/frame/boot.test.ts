import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrap } from '../engine/messages';
import type { FrameLayout, FromFrame, ToFrame } from '../engine/protocol';
import { bootFrame } from './boot';

const layout: FrameLayout = {
  colors: { page: '#ffffff', ink: '#000000', link: '#0000ff', veils: { amber: '#111111', sage: '#222222', terracotta: '#333333', night: '#444444' } },
  font: 'lora', fontSize: 18, lineHeight: 1.6, margins: 'medium', justify: true, hyphenate: true,
  publisherStyles: true, flow: 'paginated', twoPages: true, animated: false, pdfFit: 'width',
};

/** Just enough of foliate-js's `<foliate-view>` for the frame to drive. */
const RECT = { left: 10, top: 20, width: 30, height: 12 } as DOMRect;

class FakeView extends HTMLElement {
  book: unknown;
  renderer = Object.assign(document.createElement('div'), {
    goTo: vi.fn(async () => undefined),
    setStyles: vi.fn(),
    atStart: true,
    atEnd: false,
    getContents: () => [{ index: 1, doc: (this as unknown as FakeView).doc }],
  });
  async open(file: File) {
    if (file.name.endsWith('.txt')) throw new Error('File type not supported');
    this.book = {
      sections: [{ size: 100 }, { size: 300 }, { size: 50, linear: 'no' }],
      toc: [{ label: ' Uno ', href: 'a.xhtml', subitems: [{ label: 'Due', href: 'b.xhtml' }] }],
      metadata: { title: 'Il libro' },
    };
  }
  async init() {
    this.renderer.dispatchEvent(new CustomEvent('relocate', { detail: { index: 1, fraction: 0.5, range: null } }));
  }
  resolveNavigation(href: string) {
    return { index: href === 'a.xhtml' ? 0 : 1 };
  }
  getCFI(index: number) {
    return `epubcfi(/6/${index})`;
  }
  getProgressOf() {
    return { tocItem: { href: 'b.xhtml' } };
  }
  // Search and the chapter's document, as far as the chosen result needs.
  doc: unknown = document.implementation.createHTMLDocument('a');
  drawn?: (rects: Iterable<DOMRect>) => unknown;
  async *search(opts: { draw?: (rects: Iterable<DOMRect>) => unknown }) {
    this.drawn = opts.draw;
    yield { subitems: [{ cfi: 'epubcfi(/6/2)', excerpt: { pre: '', match: 'x', post: '' } }] };
    yield 'done' as const;
  }
  clearSearch() {}
  resolveCFI() {
    return { index: 1 };
  }
  addAnnotation = vi.fn(async () => undefined);
  async goTo(target: unknown) {
    if (typeof target !== 'string') return undefined;
    const me = this;
    return { index: 1, anchor: (doc: unknown) => ({ getClientRects: () => (doc === me.doc ? [RECT] : []) }) };
  }
  close() {
    this.renderer.remove();
  }
}
if (!customElements.get('foliate-view')) customElements.define('foliate-view', FakeView);

let received: FromFrame[];
let stop: () => void;
const onMessage = (e: MessageEvent) => {
  const data = e.data as { msg?: FromFrame };
  if (data?.msg && ['ready', 'opened', 'relocate', 'error', 'closed'].includes(data.msg.type)) received.push(data.msg);
};
const toFrame = (msg: ToFrame) =>
  window.dispatchEvent(new MessageEvent('message', { data: wrap(msg), origin: location.origin, source: window }));
const until = (fn: () => boolean) => vi.waitFor(() => expect(fn()).toBe(true));

beforeEach(() => {
  received = [];
  window.addEventListener('message', onMessage);
  stop = bootFrame({ load: async () => ({ Overlayer: {} as never }) });
});
afterEach(() => {
  stop();
  window.removeEventListener('message', onMessage);
  document.querySelectorAll('foliate-view').forEach((v) => v.remove());
});

describe('bootFrame', () => {
  it('says ready, opens a book and reports what it holds', async () => {
    await until(() => received.some((m) => m.type === 'ready'));
    toFrame({ type: 'open', file: new Blob(['x']), name: 'Libro.EPUB', at: null, layout });
    await until(() => received.some((m) => m.type === 'relocate'));
    const opened = received.find((m) => m.type === 'opened');
    expect(opened).toMatchObject({
      format: 'epub',
      title: 'Il libro',
      sectionChars: [100, 300, 0],
      sectionFractions: [0, 0.25, 1, 1],
    });
    const toc = (opened as Extract<FromFrame, { type: 'opened' }>).toc;
    expect(toc).toEqual([
      { label: 'Uno', href: 'a.xhtml', fraction: 0, children: [{ label: 'Due', href: 'b.xhtml', fraction: 0.25, children: [] }] },
    ]);
    const at = (received.find((m) => m.type === 'relocate') as Extract<FromFrame, { type: 'relocate' }>).at;
    expect(at).toMatchObject({ sectionIndex: 1, sectionFraction: 0.5, fraction: 0.625, tocHref: 'b.xhtml', atStart: true, atEnd: false });
  });

  it('answers an unsupported file with an error', async () => {
    toFrame({ type: 'open', file: new Blob(['x']), name: 'nota.txt', at: null, layout });
    await until(() => received.some((m) => m.type === 'error'));
    expect(received.find((m) => m.type === 'error')).toEqual({ type: 'error', code: 'unsupported_format' });
    expect(document.querySelector('foliate-view')).toBeNull();
  });

  it('closes without leaving an error behind', async () => {
    toFrame({ type: 'open', file: new Blob(['x']), name: 'a.epub', at: null, layout });
    await until(() => received.some((m) => m.type === 'opened'));
    toFrame({ type: 'close' });
    await until(() => received.some((m) => m.type === 'closed'));
    expect(document.querySelector('foliate-view')).toBeNull();
    // foliate-js's last observer report after a close is the one that threw; it must not reach the page.
    const late = new ErrorEvent('error', { message: "Cannot destructure property 'style' of 'el' as it is undefined.", filename: 'http://localhost/reader/foliate-js/paginator.js', cancelable: true });
    window.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    // Any other error is still the page's to see.
    const other = new ErrorEvent('error', { message: 'something else', filename: 'http://localhost/reader/foliate-js/paginator.js', cancelable: true });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('ignores messages of other windows', async () => {
    const other = document.createElement('iframe');
    document.body.append(other);
    window.dispatchEvent(new MessageEvent('message', { data: wrap({ type: 'close' } as ToFrame), origin: location.origin, source: other.contentWindow }));
    await new Promise((r) => setTimeout(r, 120));
    expect(received.some((m) => m.type === 'closed')).toBe(false);
  });

  it('the_chosen_result_keeps_its_outline_after_coming_back', async () => {
    stop();
    const calls: string[] = [];
    const g = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const Overlayer = { highlight: g, underline: () => (calls.push('underline'), g()), outline: () => (calls.push('outline'), g()) };
    stop = bootFrame({ load: async () => ({ Overlayer: Overlayer as never }) });
    toFrame({ type: 'open', file: new Blob(['x']), name: 'a.epub', at: null, layout });
    await until(() => received.some((m) => m.type === 'opened'));
    toFrame({ type: 'search', id: 1, query: 'x' });
    const view = document.querySelector('foliate-view') as unknown as FakeView;
    await until(() => !!view.drawn);
    await new Promise((r) => setTimeout(r, 20));
    toFrame({ type: 'goto', target: { cfi: 'epubcfi(/6/2)' } });
    await until(() => view.addAnnotation.mock.calls.length > 0);
    view.drawn!([RECT]);
    expect(calls.pop()).toBe('outline');
    // The chapter is left and drawn again: a new document.
    view.doc = document.implementation.createHTMLDocument('b');
    view.dispatchEvent(new CustomEvent('load', { detail: { doc: view.doc, index: 1 } }));
    view.drawn!([RECT]);
    expect(calls.pop()).toBe('outline');
  });
});
