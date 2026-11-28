import { afterEach, describe, expect, it } from 'vitest';
import { installFileDropGuard } from './fileDropGuard';

function fileDrag(type: 'dragover' | 'drop', types = ['Files']) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  const dataTransfer = { types, dropEffect: 'copy' };
  Object.defineProperty(e, 'dataTransfer', { value: dataTransfer });
  return { e, dataTransfer };
}

describe('installFileDropGuard', () => {
  let remove: (() => void) | undefined;
  afterEach(() => {
    remove?.();
    document.body.innerHTML = '';
  });

  it('cancels a file drag nobody handled, so the window does not open the file', () => {
    remove = installFileDropGuard();
    for (const type of ['dragover', 'drop'] as const) {
      const { e, dataTransfer } = fileDrag(type);
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(dataTransfer.dropEffect).toBe('none');
    }
  });

  it('leaves alone a drag a page already took', () => {
    remove = installFileDropGuard();
    const zone = document.body.appendChild(document.createElement('div'));
    zone.addEventListener('drop', (e) => e.preventDefault());
    const { e, dataTransfer } = fileDrag('drop');
    zone.dispatchEvent(e);
    expect(dataTransfer.dropEffect).toBe('copy');
  });

  it('cancels a dragged link nobody handled', () => {
    remove = installFileDropGuard();
    for (const types of [['text/uri-list'], ['text/plain', 'text/uri-list']]) {
      const { e, dataTransfer } = fileDrag('drop', types);
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      expect(dataTransfer.dropEffect).toBe('none');
    }
  });

  it('lets text be dropped on an editable field', () => {
    remove = installFileDropGuard();
    const input = document.body.appendChild(document.createElement('input'));
    const area = document.body.appendChild(document.createElement('textarea'));
    const rich = document.body.appendChild(document.createElement('div'));
    rich.setAttribute('contenteditable', 'true');
    const inner = rich.appendChild(document.createElement('span'));
    for (const el of [input, area, inner]) {
      const { e } = fileDrag('drop', ['text/plain']);
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
  });

  it('ignores drags that carry neither files nor links', () => {
    remove = installFileDropGuard();
    const { e } = fileDrag('dragover', ['application/x-thing']);
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('stops guarding once removed', () => {
    installFileDropGuard()();
    const { e } = fileDrag('drop');
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
