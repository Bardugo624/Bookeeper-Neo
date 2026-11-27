import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

const MB = 1024 * 1024;

describe('formatBytes', () => {
  it('writes MB without decimals below 1 GB', () => {
    expect(formatBytes(24 * MB, 'it')).toBe('24 MB');
    expect(formatBytes(24 * MB, 'en')).toBe('24 MB');
  });

  it('writes GB with one decimal, in the language on show', () => {
    const bytes = 212 * 1024 ** 3;
    expect(formatBytes(bytes, 'it')).toBe('212,0 GB');
    expect(formatBytes(bytes, 'en')).toBe('212.0 GB');
  });

  it('switches to GB as soon as the MB would round to 1024', () => {
    expect(formatBytes(1023.4 * MB, 'en')).toBe('1,023 MB');
    expect(formatBytes(1023.5 * MB, 'en')).toBe('1.0 GB');
    expect(formatBytes(1023.6 * MB, 'it')).toBe('1,0 GB');
  });

  it('groups thousands as the language does', () => {
    expect(formatBytes(1000 * MB, 'en')).toBe('1,000 MB');
    expect(formatBytes(1500 * 1024 ** 3, 'en')).toBe('1,500.0 GB');
  });
});
