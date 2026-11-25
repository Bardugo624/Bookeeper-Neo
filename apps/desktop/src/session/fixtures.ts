import type { MeOut } from '@bookeeper/api';

export const ME: MeOut = {
  device: { current: true, id: 'd1', kind: 'desktop', name: 'Test', paired_at: 0 },
  library: { id: 'l1', name: 'Casa Rossi' },
  user: { id: 'u1', display_name: 'Anna', role: 'owner' },
} as MeOut;

export const ok = (body: unknown) => ({ status: 200, body });
export const unauthorized = { status: 401, body: { error: { code: 'unauthorized', message: 'x' } } };
