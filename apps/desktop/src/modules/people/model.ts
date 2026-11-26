import type { InviteRole, PersonOut } from '@bookeeper/api';
import type { FormErrors, Role } from '../../kit';

/** Limit enforced by the core: 1 to 60 characters after trimming. */
export const LIMITS = { name: 60 } as const;

export const INVITE_DAYS = [1, 7, 30] as const;
export type InviteDays = (typeof INVITE_DAYS)[number];
export const DEFAULT_INVITE_DAYS: InviteDays = 7;
export const DEFAULT_INVITE_ROLE: InviteRole = 'member';

export type PersonAction = 'role' | 'rename' | 'remove' | 'owner' | 'leave';

export interface Actor {
  id: string;
  role: Role;
}

/** Roles the actor can give to someone else (also the roles an invitation can carry). */
export function assignableRoles(actor: Role | null): InviteRole[] {
  if (actor === 'owner') return ['admin', 'member', 'guest'];
  if (actor === 'admin') return ['member', 'guest'];
  return [];
}

export function canInvite(actor: Role | null): boolean {
  return actor === 'owner' || actor === 'admin';
}

/**
 * "Chi gestisce chi" (contract 6A): the owner manages everybody but themself, an admin manages
 * members and guests, nobody manages the owner. Everybody renames themself; everybody but the owner
 * can leave. Only the owner hands the library over.
 */
export function personActions(actor: Actor | null, person: Pick<PersonOut, 'id' | 'role'>): PersonAction[] {
  if (!actor) return [];
  if (person.id === actor.id) return actor.role === 'owner' ? ['rename'] : ['rename', 'leave'];
  if (person.role === 'owner') return [];
  if (actor.role === 'owner') return ['role', 'rename', 'remove', 'owner'];
  if (actor.role === 'admin' && (person.role === 'member' || person.role === 'guest')) return ['role', 'rename', 'remove'];
  return [];
}

export interface NameValues {
  name: string;
}

export function validateName(values: NameValues): FormErrors<NameValues> {
  const name = values.name.trim();
  if (name.length === 0) return { name: 'required' };
  if ([...name].length > LIMITS.name) return { name: 'tooLong' };
  return {};
}

/** The phone opens the public HTTPS address only when the server says it is ready for phones. */
export function phoneAddress(server: { phone_ready: boolean; public_url?: string | null } | undefined): string | undefined {
  return server?.phone_ready ? (server.public_url ?? undefined) : undefined;
}

/** Queries every write here may change besides the people themselves. */
export const TOUCHED_KEYS = ['people', 'invites', 'books', 'facets', 'reading', 'loans', 'wishlist', 'isbn-index'] as const;
