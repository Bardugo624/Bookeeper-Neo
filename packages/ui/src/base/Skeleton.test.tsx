import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

it('is hidden from assistive tech and takes its size', () => {
  const { container } = render(<Skeleton width={144} height={216} />);
  const el = container.firstElementChild as HTMLElement;
  expect(el).toHaveAttribute('aria-hidden', 'true');
  expect(el.style.width).toBe('144px');
  expect(el.style.height).toBe('216px');
});
