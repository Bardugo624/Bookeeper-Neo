import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TagChips } from './TagChips';
import { TAG_COLORS, colorOf } from './tagModel';

describe('TagChips', () => {
  it('links every tag to the list filtered by it', () => {
    render(
      <MemoryRouter>
        <TagChips tags={[{ id: 'a b', name: 'Fantasy', color: 'plum' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Fantasy' })).toHaveAttribute('href', '/books?tag=a%20b');
  });

  it('renders nothing without tags', () => {
    const { container } = render(
      <MemoryRouter>
        <TagChips tags={[]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each(TAG_COLORS)('%s: the text takes a text token, the tag color only tints the chip', (color) => {
    render(
      <MemoryRouter>
        <TagChips tags={[{ id: color, name: `Tag ${color}`, color }]} />
      </MemoryRouter>,
    );
    const chip = screen.getByRole('link', { name: `Tag ${color}` });
    // The color arrives only as a CSS variable, never as `color`.
    expect(chip.style.color).toBe('');
    expect(chip.style.getPropertyValue('--tag-color')).toBe(colorOf(color));
    expect(chip.querySelector('[style]')).toBeNull();
  });
});
