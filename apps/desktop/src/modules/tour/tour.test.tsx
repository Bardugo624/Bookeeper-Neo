import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTourStore, registerTourPath, resetTourForTest, tourSignal, useTour } from './store';
import { loadTour, saveTour, isTourPending, setTourPending, clearTourPending } from './storage';
import { clicks, flush, installBrowser, PATH, renderTour } from './testkit';

const state = () => useTourStore.getState();
const START = async () => {
  renderTour();
  await screen.findByRole('heading', { name: 'Pagina' });
  await flush();
  act(() => state().start(PATH));
  await flush();
};
const spot = () => document.querySelector('[data-tour-spotlight] > div') as HTMLElement | null;

beforeEach(() => {
  resetTourForTest();
  localStorage.clear();
  clicks.mockClear();
  installBrowser();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('flow', () => {
  it('lights up the anchor of the first step and shows the card', async () => {
    await START();
    expect(state().status).toBe('running');
    expect(spot()).not.toBeNull();
    // 100,100 grown by the margin
    expect(spot()!.style.transform).toBe('translate(92px, 92px)');
    expect(screen.getByRole('region', { name: 'Primi passi' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves on with the right signal, ignores a wrong one, ends in done', async () => {
    await START();
    act(() => tourSignal('other'));
    expect(state().step).toBe(0);
    act(() => tourSignal('one-done'));
    expect(state().step).toBe(1);
    act(() => tourSignal('two-done', 'no'));
    expect(state().step).toBe(1);
    act(() => tourSignal('two-done', 'ok'));
    expect(state().step).toBe(2);
    act(() => tourSignal('three-done'));
    expect(state().status).toBe('done');
    await flush();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(spot()).toBeNull();
  });

  it('a signal with no tour running does nothing', () => {
    expect(() => tourSignal('one-done')).not.toThrow();
    expect(state().status).toBe('idle');
  });

  it('a step may pick its target from the page', async () => {
    await START();
    act(() => tourSignal('one-done'));
    await flush();
    expect(spot()!.style.transform).toBe('translate(292px, 92px)');
  });

  it('a path of more than three steps is refused', () => {
    expect(() => registerTourPath({ id: 'big', steps: [...PATH.steps, PATH.steps[0]!] })).toThrow();
  });
});

describe('leaving and coming back', () => {
  it('"Lo faccio dopo" pauses, and «Primi passi» resumes at the same step', async () => {
    await START();
    act(() => tourSignal('one-done'));
    await userEvent.click(screen.getByRole('button', { name: 'Lo faccio dopo' }));
    expect(state().status).toBe('paused');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    const pill = screen.getByRole('button', { name: 'Primi passi 2 di 3' });
    await userEvent.click(pill);
    expect(state().status).toBe('running');
    expect(state().step).toBe(1);
  });

  it('Escape and a press elsewhere pause; a press on the target and on the card do not', async () => {
    await START();
    await userEvent.click(screen.getByRole('button', { name: 'uno' }));
    expect(clicks).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('heading', { name: 'Primi passi' }));
    expect(state().status).toBe('running');
    await userEvent.click(screen.getByRole('button', { name: 'altrove' }));
    expect(state().status).toBe('paused');
    act(() => state().resume());
    await userEvent.keyboard('{Escape}');
    expect(state().status).toBe('paused');
  });

  it('"Non mostrare più" and "Salta il tutorial" skip for good', async () => {
    await START();
    await userEvent.click(screen.getByRole('button', { name: 'Salta il tutorial' }));
    expect(state().status).toBe('skipped');
    act(() => state().start(PATH));
    expect(state().status).toBe('skipped');
    expect(loadTour('c1').status).toBe('skipped');

    act(() => state().start(PATH, { replay: true }));
    act(() => state().pause());
    await userEvent.click(screen.getByRole('button', { name: 'Altre azioni di Primi passi' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Non mostrare più' }));
    expect(state().status).toBe('skipped');
    expect(screen.queryByRole('button', { name: /Primi passi/ })).not.toBeInTheDocument();
  });

  it('finishing does not come back either', async () => {
    await START();
    act(() => {
      tourSignal('one-done');
      tourSignal('two-done', 'ok');
      tourSignal('three-done');
      state().start(PATH);
    });
    expect(state().status).toBe('done');
  });
});

describe('memory', () => {
  it('shows a saved tour after a restart once its path is registered later', async () => {
    localStorage.setItem('bookeeper.tour.c1', JSON.stringify({ pathId: 'test', step: 1, status: 'running' }));
    renderTour('c1');
    await flush();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    act(() => state().start(PATH));
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('survives a new mount of the same connection and is separate per connection', async () => {
    const first = renderTour('c1');
    await flush();
    act(() => state().start(PATH));
    act(() => tourSignal('one-done'));
    expect(JSON.parse(localStorage.getItem('bookeeper.tour.c1')!)).toEqual({ pathId: 'test', step: 1, status: 'running' });
    first.unmount();
    useTourStore.setState({ connectionId: null, pathId: null, step: 0, status: 'idle' });
    renderTour('c1');
    registerTourPath(PATH);
    await flush();
    expect(state().step).toBe(1);
    expect(state().status).toBe('running');
    expect(loadTour('c2').status).toBe('idle');
  });

  it('forgets the note and the seen signals when the connection changes, and rereads the new one', () => {
    saveTour('c2', { pathId: 'test', step: 2, status: 'paused' });
    useTourStore.setState({ connectionId: null });
    state().bind('c1');
    act(() => state().setNote({ titleKey: 'tour.dismiss', textKey: 'tour.card.step' }));
    useTourStore.setState({ seen: ['x'] });
    state().bind('c2');
    expect(state().note).toBeNull();
    expect(state().seen).toEqual([]);
    expect(state().step).toBe(2);
    expect(state().status).toBe('paused');
  });

  it('reads and writes the "new person" flag per connection', () => {
    expect(isTourPending('c1')).toBe(false);
    setTourPending('c1');
    expect(isTourPending('c1')).toBe(true);
    expect(isTourPending('c2')).toBe(false);
    clearTourPending('c1');
    expect(isTourPending('c1')).toBe(false);
  });

  it('breaks nothing without localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await START();
    act(() => tourSignal('one-done'));
    expect(state().step).toBe(1);
    expect(isTourPending('c1')).toBe(false);
    expect(() => setTourPending('c1')).not.toThrow();
  });
});

describe('card', () => {
  it('is a named region, never a dialog; bookmarks say their state; the announcement follows the step', async () => {
    await START();
    const card = screen.getByRole('region', { name: 'Primi passi' });
    const list = within(card).getByRole('list', { name: 'Avanzamento' });
    expect(list).toHaveTextContent('1: in corso');
    expect(list).toHaveTextContent('2: da fare');
    expect(card).toHaveTextContent('Passo 1 di 3');
    expect(within(card).getByRole('status')).toHaveTextContent('Passo 1 di 3: Primi passi');
    act(() => tourSignal('one-done'));
    expect(list).toHaveTextContent('1: fatto');
    expect(list).toHaveTextContent('2: in corso');
    act(() => tourSignal('two-done', 'ok'));
    expect(within(screen.getByRole('region')).getByRole('status')).toHaveTextContent('Passo 3 di 3: Non mostrare più');
  });

  it('does not take the focus from the target', async () => {
    await START();
    screen.getByRole('button', { name: 'uno' }).focus();
    act(() => tourSignal('other'));
    await flush();
    expect(screen.getByRole('button', { name: 'uno' })).toHaveFocus();
  });

  it('stays, without the lamp, when the anchor is not on the page', async () => {
    await START();
    act(() => tourSignal('one-done'));
    act(() => tourSignal('two-done', 'ok'));
    await userEvent.click(screen.getByRole('button', { name: 'tre' }));
    await flush();
    expect(screen.getByRole('dialog', { name: 'Finestra' })).toBeInTheDocument();
  });

  it('is drawn inside an open dialog when the anchor lives there, and a click on it does not close it', async () => {
    await START();
    act(() => tourSignal('one-done'));
    act(() => tourSignal('two-done', 'ok'));
    await userEvent.click(screen.getByRole('button', { name: 'tre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finestra' });
    // The step now follows the anchor inside the dialog.
    act(() => state().start(
      { id: 'in', steps: [{ id: 'd', titleKey: 'tour.dismiss', textKey: 'tour.card.step', params: { n: 1, total: 1 }, target: 'in-dialog', signal: 'x' }] },
      { replay: true },
    ));
    await flush();
    const card = within(dialog).getByRole('region', { name: 'Non mostrare più' });
    await userEvent.click(within(card).getByRole('heading'));
    expect(screen.getByRole('dialog', { name: 'Finestra' })).toBeInTheDocument();
    expect(state().status).toBe('running');
    // pressing elsewhere inside the same dialog is use, not leaving
    await userEvent.click(within(dialog).getByRole('heading', { name: 'Finestra' }));
    expect(state().status).toBe('running');
  });

  it('sits beside the dialog panel, not over it, and stays clickable', async () => {
    await START();
    act(() => tourSignal('one-done'));
    act(() => tourSignal('two-done', 'ok'));
    await userEvent.click(screen.getByRole('button', { name: 'tre' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finestra' });
    act(() => state().start(
      { id: 'in', steps: [{ id: 'd', titleKey: 'tour.dismiss', textKey: 'tour.card.step', params: { n: 1, total: 1 }, target: 'in-dialog', signal: 'x' }] },
      { replay: true },
    ));
    await flush();
    const card = within(dialog).getByRole('region', { name: 'Non mostrare più' });
    // The panel is simulated at x 100..180 (origin 100): the card starts right of its edge.
    expect(card.getAttribute('data-side')).toBe('right');
    expect(parseFloat(card.style.left) + 100).toBeGreaterThanOrEqual(180);
    await userEvent.click(within(card).getByRole('heading'));
    expect(screen.getByRole('dialog', { name: 'Finestra' })).toBeInTheDocument();
  });
});

describe('spotlight', () => {
  it('never takes a click, by its style and by use', async () => {
    const css = readFileSync(resolve(process.cwd(), 'src/modules/tour/Spotlight.module.css'), 'utf8');
    expect(css).toMatch(/\.layer\s*{[^}]*pointer-events:\s*none/);
    await START();
    await userEvent.click(screen.getByRole('button', { name: 'uno' }));
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-tour-spotlight]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('slides by default and jumps with reduced motion', async () => {
    await START();
    expect(spot()).toHaveAttribute('data-animated', 'true');
    expect(spot()!.style.transition).toBe('');
  });

  it('does not animate with reduced motion', async () => {
    vi.unstubAllGlobals();
    installBrowser({ reduced: true });
    await START();
    expect(spot()).toHaveAttribute('data-animated', 'false');
    expect(spot()!.style.transition).toBe('none');
  });

  it('follows the anchor when the window resizes, once per frame', async () => {
    await START();
    // let the frames of the start settle, so the next schedule is a fresh one
    await act(() => new Promise((r) => setTimeout(r, 50)));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 200, y: 50, left: 200, top: 50, width: 80, height: 32, right: 280, bottom: 82, toJSON: () => ({}) });
    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    expect(frames).toHaveLength(1);
    act(() => frames[0]!(0));
    expect(spot()!.style.transform).toBe('translate(192px, 42px)');
  });
});

describe('useTour', () => {
  it('exposes the state and the current step', async () => {
    const { renderHook } = await import('@testing-library/react');
    registerTourPath(PATH);
    const { result } = renderHook(() => useTour());
    expect(result.current.status).toBe('idle');
    act(() => result.current.start(PATH));
    expect(result.current.current?.id).toBe('one');
    expect(result.current.total).toBe(3);
  });
});

describe('finale', () => {
  const WITH_FINALE = { ...PATH, finale: { titleKey: 'tour.finale.title', textKey: 'tour.finale.text' } };

  it('says «La tua libreria è pronta» with every bookmark full, then closes by itself', async () => {
    renderTour();
    await screen.findByRole('heading', { name: 'Pagina' });
    await flush();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => state().start(WITH_FINALE));
    act(() => {
      tourSignal('one-done');
      tourSignal('two-done', 'ok');
      tourSignal('three-done');
    });
    expect(state().status).toBe('done');
    const card = screen.getByRole('region', { name: 'La tua libreria è pronta' });
    expect(within(card).getAllByRole('listitem').every((li) => li.dataset.state === 'done')).toBe(true);
    expect(screen.queryByText('Primi passi')).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(6100);
    });
    vi.useRealTimers();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
