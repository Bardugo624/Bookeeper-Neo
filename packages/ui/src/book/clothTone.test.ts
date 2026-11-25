import { expect, it } from 'vitest';
import { CLOTH_TONES, clothTone } from './clothTone';

it('is deterministic', () => {
  expect(clothTone('Dune')).toBe(clothTone('Dune'));
});

it('has at least eight tones and spreads twenty titles', () => {
  expect(CLOTH_TONES.length).toBeGreaterThanOrEqual(8);
  const titles = Array.from({ length: 20 }, (_, i) => `Titolo numero ${i} ${'x'.repeat(i)}`);
  expect(new Set(titles.map(clothTone)).size).toBeGreaterThanOrEqual(5);
});

it('maps the empty string to the first tone', () => {
  expect(clothTone('')).toBe(CLOTH_TONES[0]);
});
