import type { InviteOut, PersonOut } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { module } from './routes';

type Role = PersonOut['role'];

export function person(id: string, name: string, role: Role, over: Partial<PersonOut> = {}): PersonOut {
  return { id, display_name: name, role, is_me: false, created_at: 1_700_000_000, last_seen: null, devices: 1, ...over };
}

export function invite(id: string, role: Role, over: Partial<InviteOut> = {}): InviteOut {
  const now = Math.floor(Date.now() / 1000);
  return { id, role, created_by: { id: 'u1', display_name: 'Anna' }, created_at: now - 60, expires_at: now + 86_400, ...over } as InviteOut;
}

export interface World {
  /** Role of the person using the app (`u1`). */
  role: Role;
  people: PersonOut[];
  invites?: InviteOut[];
  server?: { phone_ready: boolean; public_url: string | null };
  /** Status and code of the next write of this kind, instead of success. */
  fails?: { method: string; pattern: RegExp; status: number; code: string };
  listFails?: boolean;
  /** Code the next invitation gets. */
  inviteCode?: string;
}

/** Answers `/me`, the people and the invitations from an in-memory library. */
export function peoplePlatform(w: World): FakePlatform {
  w.invites ??= [];
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      const err = (status: number, error_code: string) => ({ status, body: { error_code, message: 'x' } });
      if (w.fails && w.fails.method === r.method && w.fails.pattern.test(p)) return err(w.fails.status, w.fails.code);
      if (p === '/api/v1/me') return ok({ ...ME, user: { ...ME.user, role: w.role, display_name: w.people.find((x) => x.id === ME.user.id)?.display_name ?? ME.user.display_name } });
      if (p === '/api/v1/auth/logout') return { status: 204, body: undefined };
      if (p === '/api/v1/server') return ok({ version: '2.0.0', tls: 'acme', ...(w.server ?? { phone_ready: false, public_url: null }) });
      if (p === '/api/v1/users' && r.method === 'GET') return w.listFails ? err(500, 'internal') : ok({ items: w.people });
      if (p === '/api/v1/invites' && r.method === 'GET') return ok({ items: w.invites });
      if (p === '/api/v1/invites' && r.method === 'POST') {
        const body = r.body as { role: Role; expires_in_days?: number };
        return { status: 201, body: { id: 'i-new', code: w.inviteCode ?? 'ABCD2345', role: body.role, expires_at: Math.floor(Date.now() / 1000) + (body.expires_in_days ?? 7) * 86_400 } };
      }
      const inv = /^\/api\/v1\/invites\/([^/]+)$/.exec(p);
      if (inv && r.method === 'DELETE') {
        w.invites = w.invites!.filter((i) => i.id !== inv[1]);
        return { status: 204, body: undefined };
      }
      const m = /^\/api\/v1\/users\/([^/]+)(\/owner)?$/.exec(p);
      const found = m && w.people.find((x) => x.id === m[1]);
      if (!found) return err(404, 'not_found');
      if (m![2]) {
        w.people = w.people.map((x) => (x.id === found.id ? { ...x, role: 'owner' } : x.id === 'u1' ? { ...x, role: 'admin' } : x));
        w.role = 'admin';
        return { status: 204, body: undefined };
      }
      if (r.method === 'PATCH') {
        const patch = r.body as { display_name?: string; role?: Role };
        Object.assign(found, patch);
        return ok(found);
      }
      if (r.method === 'DELETE') {
        w.people = w.people.filter((x) => x.id !== found.id);
        return { status: 204, body: undefined };
      }
      return err(404, 'not_found');
    },
  });
}

export function renderPeople(world: World, locale: 'it' | 'en' = 'it') {
  const platform = peoplePlatform(world);
  return { ...renderApp({ platform, modules: [module], route: '/people', locale }), platform };
}

/** Owner Anna (`u1`, the caller's id in the fixtures) plus the given people, in the server's order. */
export function library(role: Role, others: PersonOut[]): World {
  const me = person('u1', 'Anna', role, { is_me: true });
  return { role, people: role === 'owner' ? [me, ...others] : [...others.filter((o) => o.role === 'owner'), me, ...others.filter((o) => o.role !== 'owner')] };
}
