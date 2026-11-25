import { createClient, type AuthOut } from '@bookeeper/api';
import type { Connection, Platform } from '../../platform';

export type WelcomeClient = ReturnType<typeof createClient>;

const blank = (over: Partial<Connection>): Connection => ({
  id: crypto.randomUUID(),
  kind: 'remote',
  url: null,
  fingerprint: null,
  library_name: null,
  user_name: null,
  device_id: null,
  access_token: null,
  refresh_token: null,
  ...over,
});

export const newLocalConnection = () => blank({ kind: 'local' });
export const newRemoteConnection = (url: string, fingerprint: string | null) => blank({ kind: 'remote', url, fingerprint });

/** What every sign-in request says about this computer. */
export async function deviceInfo(platform: Platform) {
  return { device_kind: 'desktop' as const, device_name: await platform.deviceName() };
}

/**
 * Saves `connection` so the shell can route requests to it, runs `work`, and signs in with the
 * result. Anything that fails, or that does not end in a session, leaves no trace behind.
 */
export async function authenticate(
  platform: Platform,
  signIn: (c: Connection, auth: AuthOut) => Promise<void>,
  connection: Connection,
  work: (client: WelcomeClient) => Promise<AuthOut | null>,
): Promise<boolean> {
  const known = (await platform.connections.get()).items.some((c) => c.id === connection.id);
  if (!known) await platform.connections.upsert(connection);
  const undo = async () => {
    if (!known) await platform.connections.remove(connection.id).catch(() => undefined);
  };
  try {
    const auth = await work(createClient(platform.transport(connection.id)));
    if (!auth) {
      await undo();
      return false;
    }
    rememberLogin(connection.id, auth);
    await signIn(connection, auth);
    return true;
  } catch (e) {
    await undo();
    throw e;
  }
}

// The saved connection has no email, and "Bentornato" needs it to sign in again.
const loginKey = (id: string) => `bookeeper.welcome.login.${id}`;

export interface LastLogin {
  email: string | null;
  libraryId: string | null;
}

function rememberLogin(id: string, auth: AuthOut): void {
  try {
    const last: LastLogin = { email: auth.user.email ?? null, libraryId: auth.library.id };
    localStorage.setItem(loginKey(id), JSON.stringify(last));
  } catch {
    // Storage may be unavailable; "Bentornato" then asks for the email.
  }
}

export function lastLogin(id: string): LastLogin {
  try {
    const raw = JSON.parse(localStorage.getItem(loginKey(id)) ?? 'null') as Partial<LastLogin> | null;
    return { email: raw?.email ?? null, libraryId: raw?.libraryId ?? null };
  } catch {
    return { email: null, libraryId: null };
  }
}

export function forgetLogin(id: string): void {
  try {
    localStorage.removeItem(loginKey(id));
  } catch {
    // Nothing to clean up.
  }
}

/** The local connection, if one is saved. */
export async function findLocal(platform: Platform): Promise<Connection | null> {
  return (await platform.connections.get()).items.find((c) => c.kind === 'local') ?? null;
}

/**
 * Renews the saved session of a local connection and activates it. Throws when it cannot:
 * the caller then tells the user. The session store picks the connection up afterwards.
 */
export async function reopenLocal(platform: Platform, local: Connection | null): Promise<Connection> {
  if (!local?.refresh_token) throw new Error('no saved session');
  const { session } = await createClient(platform.transport(local.id)).refresh(local.refresh_token);
  const next: Connection = {
    ...local,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    device_id: session.device_id,
  };
  await platform.connections.upsert(next);
  await platform.connections.activate(next.id);
  return next;
}
