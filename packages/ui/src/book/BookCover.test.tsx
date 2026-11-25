import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BookCover } from './BookCover';
import { clothTone } from './clothTone';

const bg = (c: HTMLElement) => (c.firstElementChild as HTMLElement).style.getPropertyValue('--cover-bg');

it('shows the initial on the placeholder', () => {
  const { container } = render(<BookCover title="dune" />);
  expect(screen.getByText('D')).toBeInTheDocument();
  expect(container.querySelector('img')).toBeNull();
});

it('skips leading punctuation', () => {
  render(<BookCover title="«…ulisse" />);
  expect(screen.getByText('U')).toBeInTheDocument();
});

it('has no initial for an empty title', () => {
  const { container } = render(<BookCover title="" />);
  expect(container.querySelector('span')!.textContent).toBe('');
});

it('renders an image with empty alt and falls back on error', () => {
  const { container } = render(<BookCover title="Dune" src="/c.jpg" />);
  const img = container.querySelector('img')!;
  expect(img).toHaveAttribute('alt', '');
  expect(img).toHaveAttribute('loading', 'lazy');
  expect(img).toHaveAttribute('decoding', 'async');
  fireEvent.error(img);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('D')).toBeInTheDocument();
});

it('prefers an explicit color over the cloth tone', () => {
  const { container } = render(<BookCover title="Dune" color="#123456" />);
  expect(bg(container as HTMLElement)).toBe('#123456');
  const other = render(<BookCover title="Dune" />);
  expect(other.container.firstElementChild!.getAttribute('style')).toContain(clothTone('Dune'));
});

it('renders children over the cover', () => {
  render(
    <BookCover title="Dune">
      <span>etichetta</span>
    </BookCover>,
  );
  expect(screen.getByText('etichetta')).toBeInTheDocument();
});
