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
