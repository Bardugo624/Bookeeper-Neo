import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Tag } from './Tag';

it('renders its text for every tone', () => {
  for (const tone of ['neutral', 'primary', 'ok', 'warn', 'danger'] as const) {
    const { unmount } = render(<Tag tone={tone}>{tone}</Tag>);
    expect(screen.getByText(tone)).toBeInTheDocument();
    unmount();
  }
});
