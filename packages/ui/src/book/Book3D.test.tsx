import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Book3D } from './Book3D';

const spine = (pages?: number) => {
  const { container } = render(<Book3D title="T" pages={pages} />);
  return (container.firstElementChild as HTMLElement).style.getPropertyValue('--book-spine');
};

it('shows title and author without src', () => {
  render(<Book3D title="Il nome della rosa" author="Umberto Eco" />);
  expect(screen.getByText('Il nome della rosa')).toBeInTheDocument();
  expect(screen.getByText('Umberto Eco')).toBeInTheDocument();
});

it('hides title and author when there is a cover image', () => {
  const { container } = render(<Book3D title="X" author="Y" src="/c.jpg" />);
  expect(container.querySelector('img')).toHaveAttribute('alt', '');
  expect(screen.queryByText('Y')).toBeNull();
});

it.each([
  [50, '14px'],
  [100, '14px'],
  [450, '27px'],
  [800, '40px'],
  [2000, '40px'],
  [undefined, '24px'],
  [Infinity, '40px'],
  [NaN, '24px'],
  [0, '24px'],
  [-5, '24px'],
])('spine thickness for %s pages', (pages, expected) => {
  expect(spine(pages)).toBe(expected);
});

const face = (pages?: number, width?: number) => {
  const { container } = render(<Book3D title="T" pages={pages} width={width} />);
  return (container.firstElementChild as HTMLElement).style.getPropertyValue('--book-face');
};

it.each([50, 947, undefined])('keeps the same cover face for %s pages: the spine never narrows it', (pages) => {
  expect(face(pages)).toBe('192px');
  expect(face(pages, 160)).toBe('112px');
});

it('wraps the cover image around the spine, and keeps the cloth spine without an image', () => {
  const { container, rerender } = render(<Book3D title="X" src="/c.jpg" />);
  const spineImg = container.querySelector('[aria-hidden="true"] img');
  expect(spineImg).toHaveAttribute('src', '/c.jpg');
  rerender(<Book3D title="X" />);
  expect(container.querySelector('[aria-hidden="true"] img')).toBeNull();
});
