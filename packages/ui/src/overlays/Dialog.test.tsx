import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './polyfills';
import { Dialog } from './Dialog';
import { Drawer } from './Drawer';
import { Menu } from './Menu';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onOpenChange={setOpen} title="Edit shelf" description="Rename it" closeLabel="Close" footer={<button>Save</button>}>
        <input aria-label="Name" />
      </Dialog>
    </>
  );
}

it('opens with a named dialog role and moves focus inside', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit shelf' });
  expect(dialog).toHaveAccessibleDescription('Rename it');
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});

it('closes with Escape and returns focus to the opener', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open' });
  await user.click(opener);
  await screen.findByRole('dialog');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await waitFor(() => expect(opener).toHaveFocus());
});

it('closes from the close button', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Open' }));
  await user.click(await screen.findByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('returns focus to the menu button after a Dialog opened from a Menu item closes', async () => {
  const user = userEvent.setup();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button>First</button>
        <Menu trigger={<button>Actions</button>} items={[{ id: 'del', label: 'Delete', onSelect: () => setOpen(true) }]} />
        <button>Last</button>
        <Dialog open={open} onOpenChange={setOpen} title="Sure?" closeLabel="Close" />
      </>
    );
  }
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Actions' })).toHaveFocus();
  expect(document.body).not.toHaveFocus();
});

it('falls back to the previous focusable element when the opener is not focusable by selector and disappears', async () => {
  const user = userEvent.setup();
  function Harness2() {
    const [open, setOpen] = useState(false);
    const [gone, setGone] = useState(false);
    return (
      <>
        <button>First</button>
        <button>Second</button>
        {gone ? null : (
          <div
            tabIndex={-1}
            data-testid="opener"
            onFocus={() => {
              setOpen(true);
              setGone(true);
            }}
          >
            Row
          </div>
        )}
        <button>Last</button>
        <Dialog open={open} onOpenChange={setOpen} title="Sure?" closeLabel="Close" />
      </>
    );
  }
  render(<Harness2 />);
  screen.getByTestId('opener').focus();
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
});

describe('motion', () => {
  const realAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  const realRO = globalThis.ResizeObserver;
  const realMM = window.matchMedia;
  const realOH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  let animate: ReturnType<typeof vi.fn>;
  let roCallback: ((entries: Array<{ target: Element }>) => void) | null;
  let observed: Element[];
  /** A ResizeObserver report from the content blocks (not the panel). */
  const contentResize = () => roCallback?.(observed.filter((el) => el.getAttribute('role') !== 'dialog').map((target) => ({ target })));
  const panelResize = () => roCallback?.([{ target: screen.getByRole('dialog') }]);
  let height: number;

  function setup(reduce = false) {
    animate = vi.fn(() => ({ cancel: vi.fn(), addEventListener: vi.fn() }));
    Element.prototype.animate = animate as never;
    window.matchMedia = ((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    roCallback = null;
    observed = [];
    globalThis.ResizeObserver = class {
      constructor(cb: (entries: Array<{ target: Element }>) => void) {
        roCallback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {}
      unobserve() {}
    } as never;
    height = 200;
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
  }

  afterEach(() => {
    if (realAnimate) Object.defineProperty(Element.prototype, 'animate', realAnimate);
    else delete (Element.prototype as { animate?: unknown }).animate;
    globalThis.ResizeObserver = realRO;
    window.matchMedia = realMM;
    if (realOH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', realOH);
    else delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
  });

  const base = { onOpenChange: () => {}, title: 'T', closeLabel: 'Close' };

  it('size="wide" adds the wide class, default does not', () => {
    const { rerender } = render(<Dialog {...base} open size="wide" />);
    const wide = screen.getByRole('dialog').className;
    rerender(<Dialog {...base} open />);
    expect(wide).not.toBe(screen.getByRole('dialog').className);
    expect(wide).toMatch(/wide/);
    expect(screen.getByRole('dialog').className).not.toMatch(/wide/);
  });

  it('animates the height from the old to the new value', () => {
    setup();
    render(<Dialog {...base} open />);
    height = 320;
    contentResize();
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = animate.mock.calls[0][0] as Array<{ height: string }>;
    expect([frames[0].height, frames[1].height]).toEqual(['200px', '320px']);
  });

  it('retargets from the current height when the content changes mid-animation', () => {
    setup();
    render(
      <Dialog {...base} open>
        x
      </Dialog>,
    );
    height = 320;
    contentResize();
    height = 250; // visible (animated) height; once cancelled the panel is at its natural height
    animate.mockImplementationOnce(() => ({ cancel: vi.fn(), addEventListener: vi.fn() }));
    const first = animate.mock.results[0].value as { cancel: ReturnType<typeof vi.fn> };
    first.cancel.mockImplementation(() => {
      height = 400;
    });
    contentResize();
    expect(animate).toHaveBeenCalledTimes(2);
    const frames = animate.mock.calls[1][0] as Array<{ height: string }>;
    expect([frames[0].height, frames[1].height]).toEqual(['250px', '400px']);
  });

  it('resyncs the height when only the panel resizes, so the next animation starts from it', () => {
    setup();
    render(
      <Dialog {...base} open>
        x
      </Dialog>,
    );
    height = 800; // the window grew and lifted the max-height cap: no content change
    panelResize();
    expect(animate).not.toHaveBeenCalled();
    height = 820;
    contentResize();
    const frames = animate.mock.calls[0][0] as Array<{ height: string }>;
    expect([frames[0].height, frames[1].height]).toEqual(['800px', '820px']);
  });

  it('ignores the panel reports caused by its own animation and resyncs when it ends', () => {
    setup();
    const listeners: Record<string, () => void> = {};
    animate.mockImplementationOnce(() => ({
      cancel: vi.fn(),
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
    }));
    render(
      <Dialog {...base} open>
        x
      </Dialog>,
    );
    height = 320;
    contentResize();
    height = 260; // mid-animation
    panelResize();
    height = 330;
    listeners.finish?.();
    height = 360;
    contentResize();
    const frames = animate.mock.calls[1][0] as Array<{ height: string }>;
    expect([frames[0].height, frames[1].height]).toEqual(['330px', '360px']);
  });

  it('watches a footer that appears after opening', async () => {
    setup();
    const { rerender } = render(<Dialog {...base} open />);
    rerender(<Dialog {...base} open footer={<button>Ok</button>} />);
    await waitFor(() => expect(observed.some((el) => el.tagName === 'FOOTER')).toBe(true));
  });

  it('does not move a Drawer', () => {
    setup();
    const button = document.createElement('button');
    document.body.appendChild(button);
    render(<Drawer {...base} open origin={button} />);
    height = 320;
    contentResize();
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not animate the height with reduced motion', () => {
    setup(true);
    render(<Dialog {...base} open />);
    height = 320;
    contentResize();
    expect(animate).not.toHaveBeenCalled();
  });

  it('is born from the origin button, but not without origin or with reduced motion', () => {
    setup();
    const button = document.createElement('button');
    document.body.appendChild(button);
    const { unmount } = render(<Dialog {...base} open origin={button} />);
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = animate.mock.calls[0][0] as Array<{ opacity: number }>;
    expect(frames[0].opacity).toBe(0);
    unmount();
    animate.mockClear();
    render(<Dialog {...base} open />);
    expect(animate).not.toHaveBeenCalled();
    cleanup();
    setup(true);
    render(<Dialog {...base} open origin={button} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('works without ResizeObserver and animate', async () => {
    delete (Element.prototype as { animate?: unknown }).animate;
    // @ts-expect-error simulating jsdom
    delete globalThis.ResizeObserver;
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
