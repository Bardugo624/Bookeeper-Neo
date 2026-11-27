import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoachCard } from './CoachCard';
import { PATH } from './testkit';

afterEach(() => vi.restoreAllMocks());

function mount(width: number) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', 768);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.getBoundingClientRect = () => ({ left: 132, top: 32, width: 760, height: 704, right: 892, bottom: 736, x: 132, y: 32, toJSON() {} });
  const slot = document.createElement('div');
  slot.setAttribute('data-tour-slot', '');
  const anchor = document.createElement('button');
  dialog.append(slot, anchor);
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
  it('sits in the dialog flow and scrolls into view when there is no room beside it', () => {
    const { slot, scroll } = mount(1024);
    expect(slot.querySelector('section')).not.toBeNull();
    expect(slot.querySelector('section')!.getAttribute('data-inline')).toBe('');
    expect(scroll).toHaveBeenCalled();
  });
});
