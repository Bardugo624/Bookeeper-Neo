import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachCard } from './CoachCard';
import { PATH } from './testkit';

const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
let dialog: HTMLElement | null = null;

beforeEach(() => {
  dialog = null;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (original) Object.defineProperty(Element.prototype, 'scrollIntoView', original);
  else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  dialog?.remove();
});

function mount(width: number, withSlot: boolean) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', 768);
  dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.getBoundingClientRect = () => ({ left: 132, top: 32, width: 760, height: 704, right: 892, bottom: 736, x: 132, y: 32, toJSON() {} });
  const slot = document.createElement('div');
  slot.setAttribute('data-tour-slot', '');
  const anchor = document.createElement('button');
  if (withSlot) dialog.append(slot);
  dialog.append(anchor);
  document.body.append(dialog);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const target = { anchorId: 'one', el: anchor, rect: { x: 700, y: 690, width: 80, height: 36 } };
  render(<CoachCard step={PATH.steps[0]!} index={0} total={3} target={target} onLater={() => {}} onSkip={() => {}} />);
  return { slot, scroll };
}

describe('CoachCard in a wide dialog', () => {
  it('sits in the dialog slot without scrolling anything', () => {
    const { slot, scroll } = mount(1024, true);
    expect(slot.querySelector('section')!.getAttribute('data-inline')).toBe('');
    expect(scroll).not.toHaveBeenCalled();
  });

  it('falls back to the anchor when the dialog has no slot', () => {
    const { scroll } = mount(1024, false);
    const card = dialog!.querySelector('section')!;
    expect(card).not.toBeNull();
    expect(card.hasAttribute('data-inline')).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('the book sheet slot', () => {
  it('is sticky at the bottom of the scrolling body and hidden when empty', () => {
    const css = readFileSync('src/modules/books/BookSheet.module.css', 'utf8');
    const rule = css.match(/\.tourSlot\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/bottom:\s*0/);
    expect(rule).toMatch(/background:\s*var\(--bk-/);
    expect(css).toMatch(/\.tourSlot:empty\s*\{\s*display:\s*none/);
  });
});
