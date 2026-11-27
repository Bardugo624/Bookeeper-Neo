import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('writes MB without decimals below 1 GB', () => {
    expect(formatBytes(24 * 1024 * 1024, 'it')).toBe('24 MB');
    expect(formatBytes(24 * 1024 * 1024, 'en')).toBe('24 MB');
  });

  it('writes GB with one decimal, in the language on show', () => {
    const bytes = 212 * 1024 ** 3;
    expect(formatBytes(bytes, 'it')).toBe('212,0 GB');
    expect(formatBytes(bytes, 'en')).toBe('212.0 GB');
  });
});
