import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderLocale } from '../../i18n';
import { Reader } from './Reader';
import { useChrome } from './useChrome';
import { useReaderKeys, type Layer } from './useReaderKeys';

const key = (key: string, extra: Partial<{ ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }> = {}) => ({
  key,
  ctrl: false,
  meta: false,
  shift: false,
  alt: false,
  ...extra,
});

describe('useChrome', () => {
  it('chrome_hides_on_the_first_turn_and_returns_on_esc', () => {
    const onToggle = vi.fn();
    const { result } = renderHook(() => {
      const chrome = useChrome({ layout: 'desktop', hold: false });
      useReaderKeys({
        onNext: chrome.hide,
        onPrev: chrome.hide,
        onSearch: () => {},
        onToggleChrome: () => {
          onToggle();
          chrome.toggle();
        },
        layers: [],
      });
      return chrome;
    });
    expect(result.current.visible).toBe(true);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(result.current.visible).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.visible).toBe(true);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('mouse_brings_chrome_back_only_near_the_edges', () => {
    const { result } = renderHook(() => useChrome({ layout: 'desktop', hold: false }));
    act(() => result.current.hide());
    act(() => result.current.onPointerMove(400, 800));
    expect(result.current.visible).toBe(false);
    act(() => result.current.onPointerMove(65, 800));
    expect(result.current.visible).toBe(false);
    act(() => result.current.onPointerMove(40, 800));
    expect(result.current.visible).toBe(true);
    act(() => result.current.hide());
    act(() => result.current.onPointerMove(727, 800));
    expect(result.current.visible).toBe(false);
    act(() => result.current.onPointerMove(729, 800));
    expect(result.current.visible).toBe(true);
  });

  it('mouse_brings_chrome_back_only_near_the_edges_in_the_layout', () => {
    const onReveal = vi.fn();
    render(
      <ReaderLocale locale="it">
        <Reader layout="desktop" theme="light" chromeVisible={false} progress={0.2} top={<div />} bottom={<div />} onReveal={onReveal}>
          <iframe title="page" />
        </Reader>
      </ReaderLocale>,
    );
    fireEvent.pointerMove(screen.getByTitle('page'));
    expect(onReveal).not.toHaveBeenCalled();
    fireEvent.pointerEnter(document.querySelector('[data-zone="top"]')!);
    fireEvent.pointerEnter(document.querySelector('[data-zone="bottom"]')!);
    expect(onReveal).toHaveBeenCalledTimes(2);
  });

  it('a_tap_in_the_center_toggles_chrome_on_the_phone', () => {
    const { result } = renderHook(() => useChrome({ layout: 'phone', hold: false }));
    act(() => result.current.hide());
    act(() => result.current.onTap('start'));
    act(() => result.current.onTap('end'));
    expect(result.current.visible).toBe(false);
    act(() => result.current.onTap('center'));
    expect(result.current.visible).toBe(true);
    act(() => result.current.onTap('center'));
    expect(result.current.visible).toBe(false);
    const desktop = renderHook(() => useChrome({ layout: 'desktop', hold: false }));
    act(() => desktop.result.current.hide());
    act(() => desktop.result.current.onTap('center'));
    expect(desktop.result.current.visible).toBe(false);
  });

  it('stays_visible_while_a_question_or_a_popover_holds_it', () => {
    const { result, rerender } = renderHook(({ hold }) => useChrome({ layout: 'phone', hold }), {
      initialProps: { hold: true },
    });
    act(() => result.current.hide());
    expect(result.current.visible).toBe(true);
    rerender({ hold: false });
    expect(result.current.visible).toBe(false);
  });
});

describe('useReaderKeys', () => {
  function setup(layers: Layer[] = []) {
    const h = { onNext: vi.fn(), onPrev: vi.fn(), onSearch: vi.fn(), onToggleChrome: vi.fn() };
    const { result } = renderHook(() => useReaderKeys({ ...h, layers }));
    return { h, handle: result.current };
  }

  it('leaves_keys_a_component_already_handled', () => {
    const { h } = setup();
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    document.body.append(tab);
    tab.addEventListener('keydown', (e) => e.preventDefault());
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    expect(h.onNext).not.toHaveBeenCalled();
    tab.remove();
  });

  it('esc_closes_the_top_layer_first', () => {
    const popover = { open: true, close: vi.fn() };
    const panel = { open: true, close: vi.fn() };
    const { h } = setup([popover, panel]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(popover.close).toHaveBeenCalledTimes(1);
    expect(panel.close).not.toHaveBeenCalled();
    popover.open = false;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(panel.close).toHaveBeenCalledTimes(1);
    expect(h.onToggleChrome).not.toHaveBeenCalled();
    panel.open = false;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.onToggleChrome).toHaveBeenCalledTimes(1);
  });

  it('turns_pages_with_the_keys_of_the_design', () => {
    const { h } = setup();
    for (const k of ['ArrowRight', 'PageDown', ' ']) fireEvent.keyDown(document, { key: k });
    expect(h.onNext).toHaveBeenCalledTimes(3);
    for (const k of ['ArrowLeft', 'PageUp']) fireEvent.keyDown(document, { key: k });
    fireEvent.keyDown(document, { key: ' ', shiftKey: true });
    expect(h.onPrev).toHaveBeenCalledTimes(3);
  });

  it('ctrl_or_cmd_f_opens_the_search_and_keeps_the_browser_out', () => {
    const { h } = setup();
    const ev = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    fireEvent.keyDown(document, { key: 'f', metaKey: true });
    expect(h.onSearch).toHaveBeenCalledTimes(2);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('leaves_typing_buttons_and_dialogs_alone', () => {
    const { h } = setup();
    render(
      <div>
        <input aria-label="q" />
        <button>b</button>
        <div role="dialog"><button>in</button></div>
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText('q'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByLabelText('q'), { key: ' ' });
    fireEvent.keyDown(screen.getByText('b'), { key: ' ' });
    fireEvent.keyDown(screen.getByText('in'), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByText('in'), { key: 'Escape' });
    expect(h.onNext).not.toHaveBeenCalled();
    expect(h.onToggleChrome).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByText('b'), { key: 'ArrowRight' });
    expect(h.onNext).toHaveBeenCalledTimes(1);
  });

  it('takes_the_keys_the_frame_forwards', () => {
    const { h, handle } = setup();
    handle(key('ArrowLeft'));
    handle(key('f', { ctrl: true }));
    handle(key('ArrowRight', { alt: true }));
    expect(h.onPrev).toHaveBeenCalledTimes(1);
    expect(h.onSearch).toHaveBeenCalledTimes(1);
    expect(h.onNext).not.toHaveBeenCalled();
  });
});
