import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StatCard } from './StatCard';

const mm = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const visible = (c: HTMLElement) => c.querySelector('[aria-hidden="true"]:not(svg)')!.textContent;

it('shows the final value at once with reduced motion', () => {
  mm(true);
  const { container } = render(<StatCard label="Libri" value={42} />);
  expect(visible(container)).toBe('42');
  expect(screen.getByText('Libri')).toBeInTheDocument();
});

it('counts up to the final value with fake timers', () => {
  mm(false);
  vi.useFakeTimers();
  const { container } = render(<StatCard label="Libri" value={120} />);
  expect(visible(container)).toBe('0');
  act(() => {
    vi.advanceTimersByTime(800);
  });
  expect(visible(container)).toBe('120');
});

it('exposes the final value as accessible text and renders strings as is', () => {
  mm(false);
  render(<StatCard label="A" value={7} />);
  expect(screen.getByText('7')).toBeInTheDocument();
  render(<StatCard label="B" value="n/d" />);
  expect(screen.getByText('n/d')).toBeInTheDocument();
});
