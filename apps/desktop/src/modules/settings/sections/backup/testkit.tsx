import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { RawResponse, TransportResponse } from '@bookeeper/api';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../../../platform/testing';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { module } from '../../routes';
import { setSystemLanguage } from '../../testkit';

export interface BackupWorld {
  role?: 'owner' | 'admin' | 'member';
  config?: { interval_days: number; keep: number };
  items?: Array<{ name: string; created_at: number; size_bytes: number }>;
  /** Answer of `POST /backup`. */
  backup?: () => RawResponse | Promise<RawResponse>;
  /** Answer of `POST /restore`; receives the token header. */
  restore?: (token: string | undefined) => RawResponse | Promise<RawResponse>;
  /** Answer of `PUT /backups/config`. */
  putConfig?: (body: unknown) => TransportResponse;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): RawResponse => ({
  status,
  bytes: new Uint8Array(new TextEncoder().encode(JSON.stringify(body))),
  contentType: 'application/json',
  headers,
});

export function backupPlatform(world: BackupWorld = {}): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: world.role ?? 'owner' } };
  const platform = fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/backups/config' && r.method === 'GET') return ok(world.config ?? { interval_days: 7, keep: 5 });
      if (p === '/api/v1/backups/config') return world.putConfig?.(r.body) ?? ok(r.body);
      if (p === '/api/v1/backups') return ok({ items: world.items ?? [] });
      if (p === '/api/v1/auth/confirm') return ok({ confirm_token: 'tok', expires_in: 60 });
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
  const base = platform.transport.bind(platform);
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(req): Promise<RawResponse> {
      platform.calls.push({ method: req.method, path: req.path, body: req.body, headers: req.headers });
      if (req.path === '/api/v1/backup') {
        return (await world.backup?.()) ?? { status: 200, bytes: new Uint8Array([1, 2, 3]), contentType: 'application/zip', headers: {} };
      }
      if (req.path === '/api/v1/restore') {
        const token = req.headers?.['X-Confirm-Token'] ?? req.headers?.['x-confirm-token'];
        return (
          (await world.restore?.(token || undefined)) ??
          json(200, { books: 3, shelves: 2, loans: 1, wishlist: 4, covers: 5, users_remapped: 0 })
        );
      }
      return json(404, { error_code: 'not_found', message: 'x' });
    },
  });
  return platform;
}

export function renderBackup(world: BackupWorld = {}) {
  const platform = backupPlatform(world);
  setSystemLanguage('it-IT');
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes([module]), { initialEntries: ['/settings/backup'] });
  const view = render(
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, platform };
}
