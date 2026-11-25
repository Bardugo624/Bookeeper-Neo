import type { KeyValueStore } from '../platform';

export const SESSION_KEY = 'bookeeper.mobile.session';

export interface Tokens {
  access_token: string;
  refresh_token: string;
  device_id: string;
}

export function readTokens(storage: KeyValueStore): Tokens | null {
  try {
    const raw = storage.get(SESSION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Tokens> | null;
    if (typeof v?.access_token === 'string' && typeof v.refresh_token === 'string' && typeof v.device_id === 'string') {
      return { access_token: v.access_token, refresh_token: v.refresh_token, device_id: v.device_id };
    }
  } catch {
    // Unreadable content counts as no session.
  }
  return null;
}

export function writeTokens(storage: KeyValueStore, tokens: Tokens): void {
  storage.set(
    SESSION_KEY,
    JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, device_id: tokens.device_id }),
  );
}

export function clearTokens(storage: KeyValueStore): void {
  storage.remove(SESSION_KEY);
}
