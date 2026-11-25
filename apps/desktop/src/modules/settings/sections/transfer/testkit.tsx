import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ImportReport, MeOut } from '@bookeeper/api';
import { AppProviders } from '../../../../app/AppProviders';
import { buildRoutes } from '../../../../app/routes';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../../../platform/testing';
import { useSession } from '../../../../session';
import { ME, ok } from '../../../../session/fixtures';
import { module } from '../../routes';

export interface TransferWorld {
  role?: MeOut['user']['role'];
  /** Answer for `POST /import`. */
  importAnswer?: (body: { format?: string; content: string; dry_run?: boolean }) => { status: number; body: unknown };
  /** Body of `GET /export`, by format. */
  exportBody?: (format: string) => string;
}

export const REPORT: ImportReport = { format: 'goodreads', total: 6, new: 3, duplicates: 2, invalid: 1, preview: [], errors: [{ row: 4, message: 'title is required' }] };

export function transferPlatform(world: TransferWorld = {}): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: world.role ?? 'owner' } } as MeOut;
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/import') return world.importAnswer?.(r.body as never) ?? ok(REPORT);
      return { status: 404, body: { error_code: 'not_found', message: 'x' } };
    },
  });
}

/** Mounts the app on `/settings/transfer`; `GET /export` goes through the raw transport. */
export function renderTransfer(world: TransferWorld = {}) {
  const platform = transferPlatform(world);
  const base = platform.transport.bind(platform);
  platform.transport = (id) => ({
    ...base(id),
    async requestRaw(req) {
      platform.calls.push({ method: req.method, path: req.path, connectionId: id });
      const format = new URL(req.path, 'http://x').searchParams.get('format') ?? 'json';
      const text = world.exportBody?.(format) ?? (format === 'csv' ? 'title\r\nDune\r\n' : '{"books":[]}');
      return { status: 200, bytes: new TextEncoder().encode(text), contentType: null, headers: {} };
    },
  });
  Object.defineProperty(window.navigator, 'language', { value: 'it-IT', configurable: true });
  useSession.setState({ status: 'loading', connection: null, me: null, platform: null });
  const router = createMemoryRouter(buildRoutes([module]), { initialEntries: ['/settings/transfer'] });
  const view = render(
    <AppProviders platform={platform}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router, platform };
}
