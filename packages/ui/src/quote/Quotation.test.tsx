import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Quotation } from './Quotation';

const q = { text: 'primo\nsecondo\nterzo', author: 'Dante', work: 'Commedia' };

it('renders one block per line with the indent class', () => {
  const { container } = render(<Quotation quote={q} size={22} />);
  const lines = container.querySelectorAll('blockquote > span');
  expect(lines).toHaveLength(3);
  lines.forEach((l) => expect(l.className).toMatch(/verse/));
});
it('hides the guillemets from screen readers', () => {
  const { container } = render(<Quotation quote={q} size={22} />);
  const marks = [...container.querySelectorAll('[aria-hidden="true"]')];
  expect(marks.map((m) => m.textContent)).toEqual(['«', '»']);
});
it('sets the size on the blockquote', () => {
  const { container } = render(<Quotation quote={q} size={26} className="outer" />);
  expect(container.querySelector('blockquote')).toHaveStyle({ fontSize: '26px' });
  expect(container.querySelector('figure')).toHaveClass('outer');
});
it('captions with and without a work', () => {
  const { container, rerender } = render(<Quotation quote={q} size={22} />);
  expect(container.querySelector('figcaption')!.textContent).toBe('Dante · Commedia');
  expect(container.querySelector('cite')).toHaveTextContent('Commedia');
  rerender(<Quotation quote={{ ...q, work: null }} size={22} />);
  expect(screen.getByText('Dante').textContent).toBe('Dante');
  expect(container.querySelector('cite')).toBeNull();
  expect(container.querySelector('figcaption')!.textContent).not.toContain('·');
});
it('renders prose as a single line without the verse indent', () => {
  const { container } = render(<Quotation quote={{ text: 'uno', author: 'A', work: null }} size={33} />);
  expect(container.querySelectorAll('blockquote > span')).toHaveLength(1);
  expect(container.querySelector('blockquote > span')!.className).not.toMatch(/verse/);
});
