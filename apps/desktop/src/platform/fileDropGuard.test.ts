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

  it('ignores drags that carry no files', () => {
    remove = installFileDropGuard();
    const { e } = fileDrag('dragover', ['text/plain']);
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
