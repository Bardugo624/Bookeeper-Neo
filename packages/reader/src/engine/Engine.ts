import { unwrap, wrap } from './messages';
import type { FrameLayout, FromFrame, Mark, Target, ToFrame } from './protocol';

type Of<T extends FromFrame['type']> = Extract<FromFrame, { type: T }>;
type Handler = (msg: never) => void;

/** How long `close()` waits for the frame before it gives up and resolves anyway. */
const CLOSE_TIMEOUT_MS = 2000;

interface Search {
  id: number;
  done: () => void;
  onResult: (r: Of<'search-result'>) => void;
  onProgress: (fraction: number) => void;
}

/** An error of the engine page, with the code it sent. */
export class EngineError extends Error {
  constructor(readonly code: Of<'error'>['code']) {
    super(code);
    this.name = 'EngineError';
  }
}

/**
 * The view's side of the conversation with the engine page. Build it as soon as the iframe is created, before the
 * page has loaded: the page announces itself once. After `close()` it is spent.
 */
export class Engine {
  readonly #iframe: HTMLIFrameElement;
  readonly #handlers = new Map<FromFrame['type'], Set<Handler>>();
  readonly #ready: Promise<void>;
  #search: Search | null = null;
  #searchId = 0;
  #opening: { resolve: (m: Of<'opened'>) => void; reject: (e: Error) => void } | null = null;
  #closing: (() => void) | null = null;
  #disposed = false;

  constructor(iframe: HTMLIFrameElement) {
    this.#iframe = iframe;
    let announce!: () => void;
    this.#ready = new Promise<void>((resolve) => (announce = resolve));
    this.on('ready', () => announce());
    window.addEventListener('message', this.#onMessage);
  }

  ready(): Promise<void> {
    return this.#ready;
  }

  /** Opens a book. Another `open` while this one waits rejects the older one. */
  async open(file: Blob, name: string, at: Target | null, layout: FrameLayout): Promise<Of<'opened'>> {
    await this.#ready;
    this.#opening?.reject(new EngineError('open_failed'));
    return new Promise((resolve, reject) => {
      this.#opening = { resolve, reject };
      this.#post({ type: 'open', file, name, at, layout });
    });
  }

  setLayout(layout: FrameLayout): void {
    this.#post({ type: 'layout', layout });
  }
  next(): void {
    this.#post({ type: 'next' });
  }
  prev(): void {
    this.#post({ type: 'prev' });
  }
  goTo(target: Target): void {
    this.#post({ type: 'goto', target });
  }
  setMarks(marks: Mark[]): void {
    this.#post({ type: 'marks', marks });
  }

  /**
   * Searches the book. A new search stops the one running, and the older promise resolves right away.
   * The promise resolves when the frame says `search-done`.
   */
  search(query: string, onResult: Search['onResult'], onProgress: Search['onProgress']): Promise<void> {
    this.#supersede();
    const id = ++this.#searchId;
    return new Promise<void>((done) => {
      this.#search = { id, done, onResult, onProgress };
      this.#post({ type: 'search', id, query });
    });
  }

  stopSearch(): void {
    if (!this.#search) return;
    this.#supersede();
    this.#post({ type: 'search-stop' });
  }

  clearSelection(): void {
    this.#post({ type: 'clear-selection' });
  }

  /** Listens to one kind of message. Returns the function that stops listening. */
  on<T extends FromFrame['type']>(type: T, fn: (msg: Of<T>) => void): () => void {
    const set = this.#handlers.get(type) ?? new Set<Handler>();
    set.add(fn as Handler);
    this.#handlers.set(type, set);
    return () => {
      set.delete(fn as Handler);
    };
  }

  /** Closes the book and resolves when the frame answers `closed` (or after a short wait if it never does). */
  close(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    this.#supersede();
    this.#opening?.reject(new EngineError('open_failed'));
    this.#opening = null;
    return new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.#closing = null;
        this.#dispose();
        resolve();
      };
      const timer = setTimeout(finish, CLOSE_TIMEOUT_MS);
      this.#closing = finish;
      this.#post({ type: 'close' });
    });
  }

  #dispose(): void {
    this.#disposed = true;
    window.removeEventListener('message', this.#onMessage);
    this.#handlers.clear();
  }

  #supersede(): void {
    const old = this.#search;
    this.#search = null;
    old?.done();
  }

  #post(msg: ToFrame): void {
    if (this.#disposed) return;
    this.#iframe.contentWindow?.postMessage(wrap(msg), location.origin);
  }

  readonly #onMessage = (event: MessageEvent): void => {
    const msg = unwrap<FromFrame>(event, this.#iframe.contentWindow);
    if (!msg) return;
    switch (msg.type) {
      case 'opened':
        this.#opening?.resolve(msg);
        this.#opening = null;
        break;
      case 'error':
        this.#opening?.reject(new EngineError(msg.code));
        this.#opening = null;
        break;
      case 'search-result':
        if (msg.id === this.#search?.id) this.#search.onResult(msg);
        break;
      case 'search-progress':
        if (msg.id === this.#search?.id) this.#search.onProgress(msg.fraction);
        break;
      case 'search-done': {
        if (msg.id === this.#search?.id) this.#supersede();
        break;
      }
      case 'closed':
        this.#closing?.();
        break;
    }
    // A stale search does not reach the listeners either.
    if ((msg.type === 'search-result' || msg.type === 'search-progress' || msg.type === 'search-done') && msg.id !== this.#searchId) return;
    for (const fn of [...(this.#handlers.get(msg.type) ?? [])]) (fn as (m: FromFrame) => void)(msg);
  };
}
