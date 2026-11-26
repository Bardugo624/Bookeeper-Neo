import { describe, expect, it } from 'vitest';
import { assignableRoles, canInvite, personActions, phoneAddress, validateName, type PersonAction } from './model';

type Role = 'owner' | 'admin' | 'member' | 'guest';
const ROLES: Role[] = ['owner', 'admin', 'member', 'guest'];

const ME = 'me';
const other = (role: Role) => ({ id: 'other', role });

describe('personActions', () => {
  // actor role -> target role -> actions (the "who manages whom" table of contract 6A)
  const OTHERS: Record<Role, Record<Role, PersonAction[]>> = {
    owner: { owner: [], admin: ['role', 'rename', 'remove'], member: ['role', 'rename', 'remove'], guest: ['role', 'rename', 'remove'] },
    admin: { owner: [], admin: [], member: ['role', 'rename', 'remove'], guest: ['role', 'rename', 'remove'] },
    member: { owner: [], admin: [], member: [], guest: [] },
    guest: { owner: [], admin: [], member: [], guest: [] },
  };

  for (const actor of ROLES) {
    for (const target of ROLES) {
      it(`${actor} on another ${target}`, () => {
        expect(personActions({ id: ME, role: actor }, other(target))).toEqual(OTHERS[actor][target]);
      });
    }
  }

  it('lets everybody rename themself; leaving is in the danger zone, not in the menu', () => {
    expect(personActions({ id: ME, role: 'owner' }, { id: ME, role: 'owner' })).toEqual(['rename']);
    for (const r of ['admin', 'member', 'guest'] as Role[]) expect(personActions({ id: ME, role: r }, { id: ME, role: r })).toEqual(['rename']);
  });

  it('offers nothing without an actor', () => {
    expect(personActions(null, other('member'))).toEqual([]);
  });
});

describe('roles', () => {
  it('assigns only what the actor may', () => {
    expect(assignableRoles('owner')).toEqual(['admin', 'member', 'guest']);
    expect(assignableRoles('admin')).toEqual(['member', 'guest']);
    expect(assignableRoles('member')).toEqual([]);
    expect(assignableRoles(null)).toEqual([]);
  });

  it('lets only admin and owner invite', () => {
    expect(ROLES.filter(canInvite)).toEqual(['owner', 'admin']);
  });
});

describe('helpers', () => {
  it('validates the name like the core (1..60 after trim)', () => {
    expect(validateName({ name: '  ' })).toEqual({ name: 'required' });
    expect(validateName({ name: 'x'.repeat(61) })).toEqual({ name: 'tooLong' });
    expect(validateName({ name: ' ' + 'x'.repeat(60) + ' ' })).toEqual({});
  });

  it('gives the phone an address only when the server is ready for phones', () => {
    expect(phoneAddress(undefined)).toBeUndefined();
    expect(phoneAddress({ phone_ready: false, public_url: 'https://x' })).toBeUndefined();
    expect(phoneAddress({ phone_ready: true, public_url: null })).toBeUndefined();
    expect(phoneAddress({ phone_ready: true, public_url: 'https://x.example' })).toBe('https://x.example');
  });
});
