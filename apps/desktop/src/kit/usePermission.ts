import { useCallback } from 'react';
import type { MeOut } from '@bookeeper/api';
import { useSession } from '../session';

export type Role = MeOut['user']['role'];
export type Action = 'write' | 'admin' | 'owner';

// Mirrors `Role::rank` in the core: owner > admin > member > guest.
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1, guest: 0 };
// Minimum role per action: writing books needs `member` (`who.require(Role::Member)`).
const NEEDS: Record<Action, Role> = { write: 'member', admin: 'admin', owner: 'owner' };

export function roleCan(role: Role | null, action: Action): boolean {
  return role !== null && RANK[role] >= RANK[NEEDS[action]];
}

export function usePermission(): { role: Role | null; can(action: Action): boolean } {
  const role = useSession((s) => s.me?.user.role ?? null);
  const can = useCallback((action: Action) => roleCan(role, action), [role]);
  return { role, can };
}
