import { describe, expect, it } from 'vitest';
import { compareVersions, relation } from './version';

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('2.9.0', '2.10.0')).toBe(-1);
    expect(compareVersions('2.2.0', '2.2.0')).toBe(0);
    expect(compareVersions('3.0.0', '2.9.9')).toBe(1);
  });
  it('returns null for what it cannot read', () => {
    expect(compareVersions('abc', '2.0.0')).toBeNull();
  });
});

describe('relation', () => {
  it('names the four cases', () => {
    expect(relation({ version: '2.1.0', legacy: false }, '2.2.0')).toBe('older');
    expect(relation({ version: '2.2.0', legacy: false }, '2.2.0')).toBe('same');
    expect(relation({ version: '2.3.0', legacy: false }, '2.2.0')).toBe('newer');
    expect(relation({ version: '1.4.0', legacy: true }, '2.2.0')).toBe('legacy');
    expect(relation({ version: '??', legacy: false }, '2.2.0')).toBe('newer');
  });
});
