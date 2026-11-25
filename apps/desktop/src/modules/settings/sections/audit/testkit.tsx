import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { AuditOut, MeOut } from '@bookeeper/api';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../../../platform/testing';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { module } from '../../routes';

export const entry = (id: number, over: Partial<Omit<AuditOut, 'detail'>> & { detail?: unknown } = {}): AuditOut =>
  ({ id, at: 1_700_000_000 - id * 60, action: 'book.create', entity_type: 'book', entity_id: `b${id}`, user: { id: 'u1', display_name: 'Anna' }, device: { id: 'd1', name: 'Portatile' }, detail: { title: `Libro ${id}` }, ...over }) as AuditOut;

export interface AuditWorld {
  role?: MeOut['user']['role'];
  /** All entries, newest first; the fake pages and filters nothing by itself. */
  entries?: AuditOut[];
  /** Total reported by the core (default: entries.length). */
  total?: number;
  /** Books that still exist, by id. */
  books?: Record<string, string>;
  status?: number;
}

export function auditPlatform(world: AuditWorld = {}): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: world.role ?? 'owner' } } as MeOut;
  const entries = world.entries ?? [];
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const [p, q] = r.path.split('?') as [string, string | undefined];
      const params = new URLSearchParams(q);
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/audit/actions') return ok({ items: ['book.create', 'loan.return', 'mystery.thing'] });
      if (p === '/api/v1/devices') return ok({ devices: [{ id: 'd1', name: 'Portatile', user_id: 'u1', user_name: 'Anna', kind: 'desktop', paired_at: 0, current: true }] });
      if (p === '/api/v1/audit') {
        if (world.status) return { status: world.status, body: { error_code: 'forbidden', message: 'x' } };
        const offset = Number(params.get('offset') ?? 0);
        const limit = Number(params.get('limit') ?? 50);
        return ok({ items: entries.slice(offset, offset + limit), total: world.total ?? entries.length });
      }
      const book = /^\/api\/v1\/books\/([^/]+)$/.exec(p)?.[1];
      if (book && world.books?.[book]) return ok({ id: book, title: world.books[book], authors: [] });
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

export const auditCalls = (p: FakePlatform) => p.calls.filter((c) => c.path.split('?')[0] === '/api/v1/audit');

/** Mounts the app on `/settings/audit` (with an optional query string). */
export function renderAudit(world: AuditWorld = {}, search = '') {
  const platform = auditPlatform(world);
  Object.defineProperty(window.navigator, 'language', { value: 'it-IT', configurable: true });
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes([module]), { initialEntries: [`/settings/audit${search}`] });
  const view = render(
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, platform };
}
