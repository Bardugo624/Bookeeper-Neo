import type { MeOut } from '@bookeeper/api';
import type { KeyValueStore } from '../platform';
import { writeTokens } from './tokens';

export const ME: MeOut = {
  device: { current: true, id: 'd1', kind: 'mobile', name: 'iPhone · Safari', paired_at: 0 },
  library: { id: 'l1', name: 'Casa Rossi' },
  user: { id: 'u1', display_name: 'Anna', role: 'owner' },
} as MeOut;

export const ok = (body: unknown) => ({ status: 200, body });
export const unauthorized = (code = 'unauthorized') => ({ status: 401, body: { error_code: code, message: 'x' } });
export const refreshed = (n = 2) =>
  ok({ session: { access_token: `access-${n}`, refresh_token: `refresh-${n}`, device_id: 'd1', expires_in: 900 } });

/** Stores a paired phone's tokens, as the pairing page would. */
export function pair(storage: KeyValueStore, n = 1): void {
  writeTokens(storage, { access_token: `access-${n}`, refresh_token: `refresh-${n}`, device_id: 'd1' });
}
