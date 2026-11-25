import type { DeviceOut } from '@bookeeper/api';
import { renderApp } from '../../app/testing';
import { fakeConnection, fakePlatform, type FakePlatform } from '../../platform/testing';
import { ME, ok } from '../../session/fixtures';
import { module } from './routes';

export function device(i: number, over: Partial<DeviceOut> = {}): DeviceOut {
  return {
    id: `d${i}`,
    name: `Dispositivo ${i}`,
    kind: 'desktop',
    user_id: 'u1',
    user_name: 'Anna',
    paired_at: 1_700_000_000 + i,
    current: false,
    ...over,
  };
}

export interface Fleet {
  devices: DeviceOut[];
  role?: 'owner' | 'member' | 'guest';
  server?: { phone_ready: boolean; public_url: string | null };
  /** Status for the next pairing code request, instead of success. */
  codeFails?: { status: number; code: string; retryAfter?: number };
  /** Answers `confirmation_required` to the first revoke. */
  needsPassword?: boolean;
  listFails?: boolean;
  /** Called on every list request; may change `devices`. */
  onList?: () => void;
}

/** Answers `/me` and the device and pairing routes from an in-memory fleet. */
export function fleetPlatform(fleet: Fleet): FakePlatform {
  const me = { ...ME, user: { ...ME.user, role: fleet.role ?? 'owner' } };
  let confirmed = false;
  let issued = 0;
  return fakePlatform({
    connections: { active: 'c1', items: [fakeConnection()] },
    handler: (r) => {
      const p = r.path.split('?')[0]!;
      const err = (status: number, error_code: string) => ({ status, body: { error_code, message: 'x' } });
      if (p === '/api/v1/me') return ok(me);
      if (p === '/api/v1/auth/logout') return { status: 204, body: undefined };
      if (p === '/api/v1/auth/confirm') {
        confirmed = true;
        return ok({ confirm_token: 'tok' });
      }
      if (p === '/api/v1/server') return ok({ version: '2.0.0', tls: 'acme', ...(fleet.server ?? { phone_ready: false, public_url: null }) });
      if (p === '/api/v1/devices' && r.method === 'GET') {
        if (fleet.listFails) return err(500, 'internal');
        fleet.onList?.();
        return ok({ devices: fleet.devices });
      }
      if (p === '/api/v1/pairing/codes') {
        if (fleet.codeFails) {
          const f = fleet.codeFails;
          return { status: f.status, body: { error_code: f.code, message: 'x' }, retryAfter: f.retryAfter };
        }
        issued += 1;
        const code = issued % 2 ? 'ABCD2345' : 'WXYZ6789';
        return { status: 201, body: { code, expires_at: Math.floor(Date.now() / 1000) + 600 } };
      }
      const m = /^\/api\/v1\/devices\/([^/]+)(\/revoke)?$/.exec(p);
      const found = m && fleet.devices.find((d) => d.id === m[1]);
      if (!found) return err(404, 'not_found');
      if (m![2]) {
        if (fleet.needsPassword && !confirmed) return err(401, 'confirmation_required');
        found.revoked_at = 1_700_100_000;
        return { status: 204, body: undefined };
      }
      if (r.method === 'PATCH') {
        found.name = (r.body as { name: string }).name;
        return ok(found);
      }
      return err(404, 'not_found');
    },
  });
}

export function renderDevices(fleet: Fleet, locale: 'it' | 'en' = 'it') {
  const platform = fleetPlatform(fleet);
  return { ...renderApp({ platform, modules: [module], route: '/devices', locale }), platform };
}
