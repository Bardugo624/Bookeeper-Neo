// @vitest-environment node
import { expect, it } from 'vitest';
import { findLiteralColor } from './styleCheck';

it('rejects CSS named colors', () => {
  expect(findLiteralColor('.a { color: red; }')).toBe('red');
  expect(findLiteralColor('.a { background: color-mix(in srgb, white 18%, transparent); }')).toBe('white');
  expect(findLiteralColor('.a { border: 1px solid Black; }')).toBe('Black');
});
it('rejects hex and functional colors', () => {
  expect(findLiteralColor('.a { color: #fff; }')).not.toBeNull();
  expect(findLiteralColor('.a { color: rgb(0 0 0); }')).not.toBeNull();
});
it('accepts transparent, currentColor, inherit, tokens and words that merely contain a color', () => {
  expect(
    findLiteralColor('.red-box { color: currentColor; background: transparent; border-color: inherit; white-space: nowrap; fill: var(--bk-cover-light); }'),
  ).toBeNull();
});
