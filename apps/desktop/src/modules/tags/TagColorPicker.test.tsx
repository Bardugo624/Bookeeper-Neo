import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TagColorPicker } from './TagColorPicker';

describe('TagColorPicker while saving', () => {
  it('does not move the focus to another color when an arrow is pressed', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<TagColorPicker value="amber" label="Colore" onChange={onChange} />);
    const swatch = container.querySelector<HTMLElement>('[data-color="amber"]')!;
    swatch.focus();
    rerender(<TagColorPicker value="amber" label="Colore" onChange={onChange} disabled />);
    fireEvent.keyDown(swatch, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.dataset.color ?? 'amber').toBe('amber');
  });

  it('still moves the choice and the focus when idle', async () => {
    const onChange = vi.fn();
    const { container } = render(<TagColorPicker value="amber" label="Colore" onChange={onChange} />);
    fireEvent.keyDown(container.querySelector('[data-color="amber"]')!, { key: 'ArrowRight' });
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(container.querySelector(`[data-color="${onChange.mock.calls[0]![0]}"]`));
  });
});
