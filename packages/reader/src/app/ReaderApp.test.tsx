import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotationOut } from '@bookeeper/api';
import { THEME_COLORS } from '../model';
import { memoryQueue, type ReaderBackend } from '../data';
import { ReaderApp, type ReaderAppProps } from './ReaderApp';

const h = vi.hoisted(() => {
  const opened = {
    type: 'opened',
    toc: [{ label: 'Capitolo II', href: 'ch2.xhtml', fraction: 0.5, children: [] }],
    sectionFractions: [0, 0.5],
    sectionChars: [1000, 1000],
    format: 'epub',
    title: null,
  };
  const engines: FakeEngine[] = [];
  class FakeEngine {
    handlers = new Map<string, Set<(m: unknown) => void>>();
    openArgs: unknown[] | null = null;
    open = vi.fn(async (...args: unknown[]) => {
      this.openArgs = args;
      return opened;
    });
    setLayout = vi.fn();
    next = vi.fn();
    prev = vi.fn();
    goTo = vi.fn();
    setMarks = vi.fn();
    search = vi.fn(async () => {});
    stopSearch = vi.fn();
    clearSelection = vi.fn();
    close = vi.fn(async () => {});
    ready = vi.fn(async () => {});
    constructor() {
      engines.push(this);
    }
    on(type: string, fn: (m: unknown) => void) {
      const set = this.handlers.get(type) ?? new Set();
      set.add(fn);
      this.handlers.set(type, set);
      return () => void set.delete(fn);
    }
    emit(type: string, msg: Record<string, unknown> = {}) {
      for (const fn of [...(this.handlers.get(type) ?? [])]) fn({ type, ...msg });
    }
  }
  return { opened, engines, FakeEngine };
});
vi.mock('../engine', () => ({ Engine: h.FakeEngine }));

const rel = (fraction: number, extra: Record<string, unknown> = {}) => ({
  at: { cfi: `c${fraction}`, fraction, sectionIndex: 0, sectionFraction: fraction * 2, tocHref: null, atStart: false, atEnd: false, ...extra },
});

function makeBackend(over: Record<string, unknown> = {}) {
  const b = {
    deviceId: 'me',
    loadFile: vi.fn(async () => new Blob(['x'])),
    listPositions: vi.fn(async () => []),
    putPosition: vi.fn(async () => {}),
    getReading: vi.fn(async () => null),
    markRead: vi.fn(async () => {}),
    listAnnotations: vi.fn(async () => [] as AnnotationOut[]),
    putAnnotation: vi.fn(async (id: string, body: Record<string, unknown>) => ({
      id,
      ...body,
      color: body.color ?? null,
      note: body.note ?? null,
      chapter: body.chapter ?? null,
      deleted_at: body.deleted ? body.updated_at : null,
    })),
    openExternal: vi.fn(),
    saveText: vi.fn(async () => {}),
    queue: memoryQueue(),
    ...over,
  };
  return b;
}

async function mount(props: Partial<ReaderAppProps> = {}, backend = makeBackend()) {
  const full: ReaderAppProps = {
    backend: backend as unknown as ReaderBackend,
    book: { id: 'b1', title: 'I promessi sposi', authors: ['Alessandro Manzoni'] },
    file: { id: 'f1', sha256: 'sha', format: 'epub', name: 'promessi.epub' },
    platform: 'desktop',
    locale: 'it',
    appDark: false,
    onClose: vi.fn(),
    ...props,
  };
  const view = render(<ReaderApp {...full} />);
  const engine = h.engines[h.engines.length - 1]!;
  await waitFor(() => expect(engine.open).toHaveBeenCalled());
  await act(async () => {});
  const emit = (type: string, msg?: Record<string, unknown>) => act(() => engine.emit(type, msg));
  return { engine, backend, props: full, emit, view, rerender: (p: Partial<ReaderAppProps>) => view.rerender(<ReaderApp {...full} {...p} />) };
}

const remote = (percent: number, at: number, extra = {}) => ({
  device_id: 'phone',
  device_kind: 'mobile',
  file_id: 'f1',
  kind: 'cfi',
  value: 'epubcfi(/6/8)',
  percent,
  updated_at: at,
  ...extra,
});

const saveLocal = (percent: number, at: number) =>
  localStorage.setItem('bookeeper.reader.position.f1', JSON.stringify({ value: 'epubcfi(/6/4)', percent, at }));

beforeEach(() => {
  localStorage.clear();
  h.engines.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('ReaderApp', () => {
  it('opens_at_the_local_position', async () => {
    saveLocal(30, 100);
    const { engine } = await mount();
    expect(engine.openArgs![2]).toEqual({ cfi: 'epubcfi(/6/4)' });
    expect(engine.openArgs![1]).toBe('promessi.epub');
  });

  it('opens_at_the_start_without_any_position', async () => {
    const { engine } = await mount();
    expect(engine.openArgs![2]).toBeNull();
  });

  it('asks_to_continue_and_never_jumps_by_itself', async () => {
    saveLocal(10, 100);
    const backend = makeBackend({ listPositions: vi.fn(async () => [remote(45, 5000)]) });
    const { engine, emit } = await mount({}, backend);
    await emit('relocate', rel(0.1));
    expect(await screen.findByText('Continua da dove eri sul telefono?')).toBeInTheDocument();
    expect(engine.goTo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Vai al 45%' }));
    expect(engine.goTo).toHaveBeenCalledWith({ cfi: 'epubcfi(/6/8)' });
    expect(screen.queryByText('Continua da dove eri sul telefono?')).toBeNull();
    expect(screen.getByRole('button', { name: 'Torna al 10%' })).toBeInTheDocument();
  });

  it('turning_the_page_means_stay_here', async () => {
    saveLocal(10, 100);
    const backend = makeBackend({ listPositions: vi.fn(async () => [remote(45, 5000)]) });
    const { engine } = await mount({}, backend);
    await screen.findByText('Continua da dove eri sul telefono?');
    await userEvent.keyboard('{ArrowRight}');
    expect(engine.next).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Continua da dove eri sul telefono?')).toBeNull();
    expect(engine.goTo).not.toHaveBeenCalled();
  });

  it('a_swipe_is_a_turn_that_does_not_move_the_page_again', async () => {
    saveLocal(10, 100);
    const backend = makeBackend({ listPositions: vi.fn(async () => [remote(45, 5000)]) });
    const { engine, emit } = await mount({}, backend);
    await screen.findByText('Continua da dove eri sul telefono?');
    await emit('swipe', { direction: 'next' });
    expect(screen.queryByText('Continua da dove eri sul telefono?')).toBeNull();
    expect(engine.next).not.toHaveBeenCalled();
    expect(engine.prev).not.toHaveBeenCalled();
    expect(engine.goTo).not.toHaveBeenCalled();
  });

  it('go_to_leaves_a_way_back', async () => {
    const { engine, emit } = await mount();
    await emit('relocate', rel(0.04));
    await userEvent.click(screen.getByRole('button', { name: 'Pannello' }));
    await userEvent.click(await screen.findByRole('button', { name: /Capitolo II/ }));
    expect(engine.goTo).toHaveBeenCalledWith({ href: 'ch2.xhtml' });
    await userEvent.click(screen.getByRole('button', { name: 'Torna al 4%' }));
    expect(engine.goTo).toHaveBeenLastCalledWith({ cfi: 'c0.04' });
    expect(screen.queryByRole('button', { name: /Torna al/ })).toBeNull();
  });

  it('layout_changes_never_send_goto', async () => {
    const { engine, rerender } = await mount();
    await userEvent.click(screen.getByRole('button', { name: 'Aspetto' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Più grande' }));
    await waitFor(() => expect(engine.setLayout).toHaveBeenCalled());
    expect(engine.setLayout.mock.calls.at(-1)![0]).toMatchObject({ fontSize: 19 });
    expect(JSON.parse(localStorage.getItem('bookeeper.reader.settings')!)).toMatchObject({ fontSize: 19 });
    rerender({ appDark: true });
    expect(engine.goTo).not.toHaveBeenCalled();
    expect(engine.next).not.toHaveBeenCalled();
  });

  it('the_end_asks_to_mark_as_read', async () => {
    const { backend, emit } = await mount();
    await emit('relocate', rel(1, { atEnd: true }));
    expect(screen.getByText('Hai finito il libro. Segnarlo come letto?')).toBeInTheDocument();
    expect(backend.markRead).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Segna come letto' }));
    expect(backend.markRead).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Hai finito il libro. Segnarlo come letto?')).toBeNull();
  });

  const select = (text = 'Quel ramo del lago') => ({
    cfi: 'c-sel',
    text,
    rect: { x: 100, y: 200, width: 80, height: 20 },
  });

  it('a_highlight_from_the_selection_is_saved_and_drawn', async () => {
    const { engine, backend, emit } = await mount();
    await emit('relocate', rel(0.2));
    await emit('selection', select());
    await userEvent.click(within_toolbar('Ambra'));
    await waitFor(() =>
      expect(backend.putAnnotation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ kind: 'highlight', color: 'amber', cfi: 'c-sel', text: 'Quel ramo del lago', file_sha256: 'sha' }),
      ),
    );
    await waitFor(() =>
      expect(engine.setMarks).toHaveBeenLastCalledWith([expect.objectContaining({ cfi: 'c-sel', color: 'amber', hasNote: false })]),
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(engine.clearSelection).toHaveBeenCalled();
  });

  it('copy_and_web_search_use_the_selection', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { backend, emit } = await mount();
    await emit('selection', select());
    await user.click(screen.getByRole('button', { name: 'Copia' }));
    expect(writeText).toHaveBeenCalledWith('Quel ramo del lago');
    await emit('selection', select('a'.repeat(400)));
    await user.click(screen.getByRole('button', { name: 'Cerca sul web' }));
    expect(backend.openExternal).toHaveBeenCalledWith(`https://duckduckgo.com/?q=${'a'.repeat(300)}`);
  });

  it('export_saves_markdown_with_the_right_name', async () => {
    const saved: AnnotationOut = {
      id: 'a1',
      file_sha256: 'sha',
      kind: 'highlight',
      cfi: 'c1',
      text: 'Quel ramo del lago di Como',
      color: 'amber',
      note: 'Da rileggere.',
      percent: 1,
      chapter: 'Capitolo I',
      created_at: 10,
      updated_at: 10,
      deleted_at: null,
    };
    const backend = makeBackend({ listAnnotations: vi.fn(async () => [saved]) });
    await mount({}, backend);
    await userEvent.click(screen.getByRole('button', { name: 'Pannello' }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Note' }));
    await screen.findByText(/Quel ramo del lago/);
    await userEvent.click(screen.getByRole('button', { name: 'Esporta in Markdown' }));
    await waitFor(() => expect(backend.saveText).toHaveBeenCalled());
    const [name, text] = backend.saveText.mock.calls[0] as unknown as [string, string];
    expect(name).toBe('Alessandro Manzoni - I promessi sposi - note.md');
    expect(text).toContain('# I promessi sposi');
    expect(text).toContain('> Quel ramo del lago di Como');
    expect(text).toContain('Da rileggere.');
  });

  it('closing_flushes_the_position_first', async () => {
    const { backend, props, emit } = await mount();
    await emit('relocate', rel(0.3));
    await userEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(backend.putPosition).toHaveBeenCalledWith({ kind: 'cfi', value: 'c0.3', percent: 30 });
    expect(backend.putPosition.mock.invocationCallOrder[0]!).toBeLessThan((props.onClose as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!);
  });

  it('pagehide_and_hiding_the_page_flush_too', async () => {
    const { backend, emit } = await mount();
    await emit('relocate', rel(0.3));
    act(() => void window.dispatchEvent(new Event('pagehide')));
    await waitFor(() => expect(backend.putPosition).toHaveBeenCalledTimes(1));
    await emit('relocate', rel(0.4));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(backend.putPosition).toHaveBeenCalledTimes(2));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('the_bookmark_toggles', async () => {
    const { backend, emit } = await mount();
    await emit('relocate', rel(0.2));
    await userEvent.click(screen.getByRole('button', { name: 'Aggiungi segnalibro' }));
    await waitFor(() =>
      expect(backend.putAnnotation).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ kind: 'bookmark', cfi: 'c0.2', color: null, deleted: false })),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Togli il segnalibro' }));
    await waitFor(() =>
      expect(backend.putAnnotation).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ kind: 'bookmark', deleted: true })),
    );
    expect(await screen.findByRole('button', { name: 'Aggiungi segnalibro' })).toBeInTheDocument();
  });

  it('times_appear_only_after_three_minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { emit } = await mount();
    await emit('relocate', rel(0));
    for (let i = 1; i <= 3; i++) {
      vi.setSystemTime(Date.now() + 60_000);
      fireEvent.keyDown(document, { key: 'ArrowRight' });
      await emit('relocate', rel(i / 10));
      if (i < 3) expect(screen.queryByText(/alla fine del capitolo/)).toBeNull();
    }
    expect(screen.getByText(/alla fine del capitolo/)).toBeInTheDocument();
    expect(screen.getByText(/al libro/)).toBeInTheDocument();
  });

  it('auto_theme_follows_the_app', async () => {
    const { engine, rerender } = await mount({ appDark: true });
    const root = () => document.querySelector('[data-theme]') as HTMLElement;
    expect(root()).toHaveAttribute('data-theme', 'dark');
    expect((engine.openArgs![3] as { colors: { page: string } }).colors.page).toBe(THEME_COLORS.dark.page);
    rerender({ appDark: false });
    expect(root()).toHaveAttribute('data-theme', 'light');
    await waitFor(() => expect(engine.setLayout).toHaveBeenCalled());
    expect(engine.setLayout.mock.calls.at(-1)![0].colors.page).toBe(THEME_COLORS.light.page);
  });

  it('the_note_editor_opens_before_the_server_answers', async () => {
    const backend = makeBackend({ putAnnotation: vi.fn(() => new Promise(() => {})) });
    const { emit } = await mount({}, backend);
    await emit('relocate', rel(0.2));
    await emit('selection', select());
    await userEvent.click(screen.getByRole('button', { name: 'Nota' }));
    expect(await screen.findByRole('textbox', { name: 'La tua nota' })).toBeInTheDocument();
  });

  it('other_files_of_the_book_are_not_drawn', async () => {
    const other: AnnotationOut = {
      id: 'o1', file_sha256: 'other', kind: 'highlight', cfi: 'c-other', text: 'x', color: 'amber', note: null,
      percent: 10, chapter: null, created_at: 1, updated_at: 1, deleted_at: null,
    };
    const backend = makeBackend({ listAnnotations: vi.fn(async () => [other]) });
    const { engine } = await mount({}, backend);
    await waitFor(() => expect(backend.listAnnotations).toHaveBeenCalled());
    await act(async () => {});
    expect(engine.setMarks.mock.calls.every(([m]) => m.length === 0)).toBe(true);
  });
});

function within_toolbar(name: string): HTMLElement {
  return screen.getByRole('toolbar').querySelector(`[aria-label="${name}"]`) as HTMLElement;
}
