import '@bookeeper/ui/fonts.css';
import { unwrap, wrap } from '../engine/messages';
import type { FrameLayout, FromFrame, Mark, Target, TocItem, ToFrame } from '../engine/protocol';
import { watchDocument, toFrameRect, type FoliateViewLike } from './docEvents';
import { applyColumns, applyLayout, type Renderer } from './layout';
import { applyFallbackFont } from './fallbackFont';
import { drawMark, drawSearchHit, type OverlayerClass } from './marks';
import { runSearch, type SearchableView } from './search';
import { SectionMap } from './sections';

const FOLIATE = '/reader/foliate-js/';
/** After a book closes, foliate-js's own observers may still report once; that report is not an error to show. */
const QUIET_AFTER_CLOSE_MS = 500;
const SETTLE_MS = 60;

interface Foliate {
  Overlayer: OverlayerClass;
}

export interface BootOptions {
  /** Loads foliate-js. The tests replace it; in the page it imports `/reader/foliate-js/view.js`. */
  load?: () => Promise<Foliate>;
}

interface FoliateSection {
  size?: number;
  linear?: string;
}
interface FoliateBook {
  dir?: string;
  toc?: FoliateToc[];
  sections: FoliateSection[];
  metadata?: { title?: string | Record<string, string> };
}
interface FoliateToc {
  label?: string;
  href?: string;
  subitems?: FoliateToc[];
}
type FoliateView = FoliateViewLike &
  SearchableView & {
    renderer: Renderer & { atStart?: boolean; atEnd?: boolean; goTo(t: unknown): Promise<void> };
    open(file: File): Promise<void>;
    close(): void;
    init(o: { lastLocation?: string | null; showTextStart: boolean }): Promise<void>;
    goTo(target: string): Promise<unknown>;
    next(): Promise<void>;
    prev(): Promise<void>;
    deselect(): void;
    addAnnotation(a: unknown, remove?: boolean): Promise<unknown>;
    deleteAnnotation(a: unknown): Promise<unknown>;
    resolveNavigation(t: string): { index: number } | Promise<{ index: number }> | undefined;
    getProgressOf(index: number, range?: Range | null): { tocItem?: { href?: string } | null };
  };

interface Session {
  view: FoliateView;
  map: SectionMap;
  format: string;
  layout: FrameLayout;
  marks: Map<string, Mark>;
  off: Array<() => void>;
  searchToken: { cancelled: boolean };
  /** The search result the reader went to, and the results of the search that is drawn. */
  chosen: { cfi: string; index: number; anchor: (doc: Document) => Range; range: Range } | null;
  hits: Set<string>;
  drawHit: (rects: Iterable<DOMRect>, options?: { color?: string }) => SVGElement;
}

async function loadFoliate(): Promise<Foliate> {
  await import(/* @vite-ignore */ `${FOLIATE}view.js`);
  const { Overlayer } = (await import(/* @vite-ignore */ `${FOLIATE}overlayer.js`)) as Foliate;
  return { Overlayer };
}

const extensionOf = (name: string): string => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

function titleOf(book: FoliateBook): string | null {
  const title = book.metadata?.title;
  if (typeof title === 'string') return title.trim() || null;
  if (title && typeof title === 'object') return Object.values(title)[0]?.trim() || null;
  return null;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS));

/**
 * Starts the engine in the frame page: listens to the view, opens books with foliate-js and reports back.
 * Returns the function that stops it. The page says `ready` once it listens.
 */
export function bootFrame(options: BootOptions = {}): () => void {
  const load = options.load ?? loadFoliate;
  const parent = window.parent;
  let session: Session | null = null;
  let quietUntil = 0;
  let markHitAt = -Infinity;
  let queue: Promise<void> = Promise.resolve();

  document.documentElement.style.height = '100%';
  document.body.style.cssText += ';margin:0;height:100%';

  const send = (msg: FromFrame) => parent.postMessage(wrap(msg), location.origin);
  const fail = (e: unknown) => {
    const unsupported = e instanceof Error && (e.constructor.name === 'UnsupportedTypeError' || /not supported/i.test(e.message));
    send({ type: 'error', code: unsupported ? 'unsupported_format' : 'open_failed' });
  };

  /** Closes the book in the order that leaves nothing for foliate-js's observers to trip on. */
  async function closeSession(): Promise<void> {
    const s = session;
    if (!s) return;
    session = null;
    s.searchToken.cancelled = true;
    for (const off of s.off) off();
    quietUntil = Infinity;
    // Hidden first: the observers report the page's new size while the renderer is still whole.
    s.view.style.display = 'none';
    await settle();
    try {
      s.view.close();
    } catch (e) {
      console.error(e);
    }
    s.view.remove();
    quietUntil = performance.now() + QUIET_AFTER_CLOSE_MS;
  }

  const onError = (e: ErrorEvent) => {
    // What a closing renderer's observers throw (a missing `el` or `document`) is the only thing silenced, and only
    // when it comes from foliate-js and only around a close.
    if (performance.now() < quietUntil && e.filename.includes(FOLIATE) && /Cannot (destructure|read) propert/.test(e.message)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  function paintMarks(s: Session) {
    for (const mark of s.marks.values()) s.view.addAnnotation({ value: mark.cfi, mark }).catch(() => undefined);
  }

  function setMarks(s: Session, marks: Mark[]) {
    const next = new Map(marks.map((m) => [m.id, m]));
    for (const old of s.marks.values()) {
      const kept = next.get(old.id);
      if (!kept || kept.cfi !== old.cfi) s.view.deleteAnnotation({ value: old.cfi }).catch(() => undefined);
    }
    s.marks = next;
    paintMarks(s);
  }

  async function tocOf(s: Session, items: FoliateToc[] | undefined): Promise<TocItem[]> {
    const out: TocItem[] = [];
    for (const item of items ?? []) {
      let fraction: number | null = null;
      try {
        const resolved = item.href ? await s.view.resolveNavigation(item.href) : undefined;
        if (resolved && typeof resolved.index === 'number') fraction = s.map.fractionOf(resolved.index, 0);
      } catch {
        // An entry that points nowhere keeps its label and has no place.
      }
      out.push({ label: (item.label ?? '').trim(), href: item.href ?? '', fraction, children: await tocOf(s, item.subitems) });
    }
    return out;
  }

  function goFraction(s: Session, fraction: number) {
    const { index, anchor } = s.map.locate(fraction);
    return s.view.renderer.goTo({ index, anchor });
  }

  function refreshFallbackFont(s: Session) {
    const view = s.view as unknown as { renderer: { getContents?: () => { doc?: Document }[] } };
    for (const c of view.renderer.getContents?.() ?? []) if (c.doc) applyFallbackFont(c.doc, s.layout);
  }

  /** Draws a search result again, to outline it or to underline it. */
  function redrawHit(s: Session, cfi: string) {
    if (!s.hits.has(cfi)) return;
    s.view.addAnnotation({ value: `foliate-search:${cfi}` }).catch(console.error);
  }

  /** The reader went to a search result: it is the chosen one, and the one before it goes back to an underline. */
  function choose(s: Session, cfi: string, resolved: unknown) {
    const r = resolved as { index?: number; anchor?: (doc: Document) => Range } | undefined;
    if (!s.hits.has(cfi) || !r || typeof r.anchor !== 'function') return;
    const doc = (s.view.renderer as unknown as { getContents?: () => { index: number; doc?: Document }[] })
      .getContents?.()
      .find((c) => c.index === r.index)?.doc;
    if (!doc) return;
    const before = s.chosen?.cfi;
    s.chosen = { cfi, index: r.index!, anchor: r.anchor, range: r.anchor(doc) };
    if (before && before !== cfi) redrawHit(s, before);
    redrawHit(s, cfi);
  }

  async function goTo(s: Session, target: Target) {
    if ('fraction' in target) return goFraction(s, target.fraction);
    if ('href' in target) return s.view.goTo(target.href);
    const resolved = await s.view.goTo(target.cfi);
    choose(s, target.cfi, resolved);
    return resolved;
  }

  async function open(msg: Extract<ToFrame, { type: 'open' }>) {
    await closeSession();
    let foliate: Foliate;
    try {
      foliate = await load();
    } catch (e) {
      console.error(e);
      return send({ type: 'error', code: 'open_failed' });
    }
    const view = document.createElement('foliate-view') as FoliateView;
    view.style.cssText = 'display:block;width:100%;height:100%';
    document.body.append(view);
    try {
      await view.open(new File([msg.file], msg.name));
    } catch (e) {
      view.remove();
      return fail(e);
    }
    const book = view.book as unknown as FoliateBook;
    const sizes = book.sections.map((s) => (s.linear !== 'no' && (s.size ?? 0) > 0 ? s.size! : 0));
    const s: Session = {
      view,
      map: new SectionMap(sizes),
      format: extensionOf(msg.name),
      layout: msg.layout,
      marks: new Map(),
      off: [],
      searchToken: { cancelled: false },
      chosen: null,
      hits: new Set(),
      drawHit: (rects, options) => drawHitNow(rects, options),
    };
    const drawHitNow = drawSearchHit(foliate.Overlayer, (rects) => {
      const first = s.chosen?.range.getClientRects()[0];
      const mine = rects[0];
      return !!first && !!mine && first.left === mine.left && first.top === mine.top && first.width === mine.width;
    });
    session = s;
    const draw = drawMark(foliate.Overlayer);

    const listen = (type: string, fn: (e: CustomEvent) => void) => {
      view.addEventListener(type, fn as EventListener);
      s.off.push(() => view.removeEventListener(type, fn as EventListener));
    };
    listen('load', (e) => {
      applyFallbackFont(e.detail.doc, s.layout);
      // A chapter that is drawn again is a new document: the chosen result is found in it again.
      if (s.chosen && s.chosen.index === e.detail.index) {
        try {
          s.chosen.range = s.chosen.anchor(e.detail.doc);
        } catch (err) {
          console.error(err);
        }
      }
      s.off.push(watchDocument(e.detail.doc, e.detail.index, view, send, () => performance.now() - markHitAt < 50));
    });
    // A book never takes the page anywhere: external links stay where they are.
    listen('external-link', (e) => e.preventDefault());
    listen('create-overlay', () => paintMarks(s));
    listen('draw-annotation', (e) => {
      const mark = e.detail.annotation.mark as Mark | undefined;
      if (!mark) return;
      const { colors } = s.layout;
      e.detail.draw(draw, { veil: colors.veils[mark.color], ink: colors.ink, hasNote: mark.hasNote, color: mark.color });
    });
    listen('show-annotation', (e) => {
      const mark = [...s.marks.values()].find((m) => m.cfi === e.detail.value);
      if (!mark) return;
      const range = e.detail.range as Range;
      markHitAt = performance.now();
      send({ type: 'mark-click', id: mark.id, rect: toFrameRect(range.getBoundingClientRect(), range.startContainer.ownerDocument ?? document) });
    });
    let lastAt = '';
    const onRelocate = (e: Event) => {
      const { index, fraction, range } = (e as CustomEvent).detail as { index: number; fraction?: number; range: Range | null };
      const inSection = Number.isFinite(fraction) ? Math.min(Math.max(fraction!, 0), 1) : 0;
      let tocHref: string | null = null;
      try {
        tocHref = view.getProgressOf(index, range).tocItem?.href ?? null;
      } catch {
        // No contents table for this format.
      }
      const at = {
        cfi: view.getCFI(index, range ?? undefined),
        fraction: s.map.fractionOf(index, inSection),
        sectionIndex: index,
        sectionFraction: inSection,
        tocHref,
        atStart: view.renderer.atStart === true,
        atEnd: view.renderer.atEnd === true,
      };
      // foliate-js reports again after every re-layout; the view only needs a place that changed.
      const key = JSON.stringify(at);
      if (key === lastAt) return;
      lastAt = key;
      send({ type: 'relocate', at });
    };
    view.renderer.addEventListener('relocate', onRelocate);
    s.off.push(() => view.renderer.removeEventListener('relocate', onRelocate));

    applyLayout(view, view.renderer, msg.layout, s.format);
    send({
      type: 'opened',
      toc: await tocOf(s, book.toc),
      sectionFractions: s.map.fractions,
      sectionChars: s.map.sizes,
      format: s.format,
      title: titleOf(book),
    });
    try {
      if (msg.at && 'fraction' in msg.at) await goFraction(s, msg.at.fraction);
      else await view.init({ lastLocation: msg.at ? ('cfi' in msg.at ? msg.at.cfi : msg.at.href) : null, showTextStart: true });
    } catch (e) {
      console.error(e);
    }
  }

  function startSearch(s: Session, id: number, query: string) {
    s.searchToken.cancelled = true;
    const token = { cancelled: false };
    s.searchToken = token;
    s.view.clearSearch();
    s.chosen = null;
    s.hits = new Set();
    const drawing = { drawOptions: { color: s.layout.colors.link }, draw: s.drawHit };
    void runSearch(s.view, s.map, id, query, drawing, send, () => token.cancelled, (cfi) => s.hits.add(cfi));
  }

  async function handle(msg: ToFrame) {
    if (msg.type === 'open') return open(msg);
    if (msg.type === 'close') {
      await closeSession();
      return send({ type: 'closed' });
    }
    const s = session;
    if (!s) return;
    switch (msg.type) {
      case 'layout': {
        const colorsChanged = JSON.stringify(msg.layout.colors) !== JSON.stringify(s.layout.colors);
        s.layout = msg.layout;
        applyLayout(s.view, s.view.renderer, msg.layout, s.format);
        refreshFallbackFont(s);
        if (colorsChanged) paintMarks(s);
        break;
      }
      case 'next':
        s.view.next().catch(console.error);
        break;
      case 'prev':
        s.view.prev().catch(console.error);
        break;
      case 'goto':
        Promise.resolve(goTo(s, msg.target)).catch(console.error);
        break;
      case 'marks':
        setMarks(s, msg.marks);
        break;
      case 'clear-selection':
        s.view.deselect();
        break;
    }
  }

  const onMessage = (event: MessageEvent) => {
    const msg = unwrap<ToFrame>(event, parent);
    if (!msg) return;
    // The search runs beside everything else, so a long one never holds up a page turn.
    if (msg.type === 'search') {
      if (session) startSearch(session, msg.id, msg.query);
      else send({ type: 'search-done', id: msg.id });
      return;
    }
    if (msg.type === 'search-stop') {
      if (session) {
        session.searchToken.cancelled = true;
        session.view.clearSearch();
      }
      return;
    }
    queue = queue.then(() => handle(msg)).catch((e) => {
      console.error(e);
      if (msg.type === 'open') send({ type: 'error', code: 'open_failed' });
    });
  };
  const onKey = (e: KeyboardEvent) =>
    send({ type: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey });

  const onResize = () => {
    if (session) applyColumns(session.view.renderer, session.layout);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey);
  window.addEventListener('error', onError, true);
  send({ type: 'ready' });

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('error', onError, true);
    void closeSession();
  };
}
