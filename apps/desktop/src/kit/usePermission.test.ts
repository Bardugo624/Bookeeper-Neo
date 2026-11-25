import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ME } from '../session/fixtures';
import { useSession } from '../session';
import { usePermission, type Role } from './usePermission';

function as(role: Role | null) {
  act(() => {
    useSession.setState({ me: role ? { ...ME, user: { ...ME.user, role } } : null });
  });
  return renderHook(() => usePermission()).result.current;
}

// Core ranks (auth/mod.rs): owner > admin > member > guest; books are written from `member`.
describe('usePermission', () => {
  it.each([
    ['owner', true, true, true],
    ['admin', true, true, false],
    ['member', true, false, false],
    ['guest', false, false, false],
  ] as const)('%s: write=%s admin=%s owner=%s', (role, write, admin, owner) => {
    const p = as(role);
    expect(p.role).toBe(role);
    expect([p.can('write'), p.can('admin'), p.can('owner')]).toEqual([write, admin, owner]);
  });

  it('allows nothing without a session', () => {
    const p = as(null);
    expect(p.role).toBeNull();
    expect(p.can('write')).toBe(false);
  });
});
