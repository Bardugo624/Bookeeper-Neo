import { describe, expect, it } from 'vitest';
import { CLOTH_TONES } from '@bookeeper/ui/book';
import { mayHaveCover } from './useCover';

describe('mayHaveCover', () => {
  it('is false without a color and for a placeholder tint', () => {
    expect(mayHaveCover(null)).toBe(false);
    expect(mayHaveCover(undefined)).toBe(false);
    expect(mayHaveCover(CLOTH_TONES[0]!.toUpperCase())).toBe(false);
  });
  it('is true for any other color', () => {
    expect(mayHaveCover('#123456')).toBe(true);
  });
});
