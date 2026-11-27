import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePauseTriggers } from './usePauseTriggers';

function Probe({ target, pause, wander }: { target: Element | null; pause: () => void; wander: () => void }) {
  usePauseTriggers(true, target, pause, wander);
  return null;
}

describe('usePauseTriggers', () => {
  it('pauses on a press away from the target', () => {
    const target = document.createElement('button');
    const elsewhere = document.createElement('button');
    document.body.append(target, elsewhere);
    const wander = vi.fn();
    const { unmount } = render(<Probe target={target} pause={vi.fn()} wander={wander} />);
    fireEvent.pointerDown(elsewhere);
    expect(wander).toHaveBeenCalledOnce();
    unmount();
    target.remove();
    elsewhere.remove();
  });

  it('does not pause for a press while the target it knows has left the page', () => {
    // The target follows the page a frame late (useTarget): right after a dialog swaps its content,
    // the old target is detached. A press then cannot be judged, so it must not pause the tour.
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const isbn = document.createElement('input');
    const title = document.createElement('input');
    dialog.append(isbn);
    document.body.append(dialog);
    const wander = vi.fn();
    const { unmount } = render(<Probe target={isbn} pause={vi.fn()} wander={wander} />);
    isbn.remove();
    dialog.append(title);
    fireEvent.pointerDown(title);
    expect(wander).not.toHaveBeenCalled();
    unmount();
    dialog.remove();
  });
});
