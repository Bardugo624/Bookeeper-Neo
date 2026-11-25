import { create } from 'zustand';
import { createClient, type AuthOut, type MeOut } from '@bookeeper/api';
import type { Connection, Platform } from '../platform';
import { createAuthTransport } from './authTransport';

export type SessionStatus = 'loading' | 'welcome' | 'ready';

export interface SessionState {
  status: SessionStatus;
  connection: Connection | null;
  me: MeOut | null;
  platform: Platform | null;
  /** Reads the connections and, with a usable token, confirms the session with `GET /me`. */
  init(platform: Platform): Promise<void>;
  signIn(connection: Connection, auth: AuthOut): Promise<void>;
  signOut(): Promise<void>;
  forget(id: string): Promise<void>;
  /** Stores renewed tokens on the active connection. Used by the authenticated transport. */
  saveTokens(connection: Connection, tokens: Pick<Connection, 'access_token' | 'refresh_token' | 'device_id'>): Promise<void>;
  /** The session can no longer be renewed: back to `welcome`, connection kept. */
  expire(): void;
}

const INITIAL = { status: 'loading', connection: null, me: null, platform: null } as const;

// The transport module reads this store back, but only at call time, so the import cycle is safe.
const authedClient = (platform: Platform) => createClient(createAuthTransport(platform));

export const useSession = create<SessionState>((set, get) => ({
  ...INITIAL,

  async init(platform) {
    set({ ...INITIAL, platform });
    let connection: Connection | null = null;
    try {
      const all = await platform.connections.get();
      connection = all.items.find((c) => c.id === all.active) ?? null;
    } catch {
      connection = null;
    }
    if (!connection) {
      set({ status: 'welcome', connection: null, me: null });
      return;
    }
    set({ connection });
    if (!connection.access_token && !connection.refresh_token) {
      set({ status: 'welcome' });
      return;
    }
    try {
      const me = await authedClient(platform).me();
      // A failed renewal during `me` already moved the store to `welcome`.
      if (get().status === 'loading') set({ status: 'ready', me });
    } catch {
      set({ status: 'welcome', me: null });
    }
  },

  async signIn(connection, auth) {
    const platform = get().platform;
    if (!platform) throw new Error('session not initialised');
    const next: Connection = {
      ...connection,
      library_name: auth.library.name,
      user_name: auth.user.display_name,
      device_id: auth.session.device_id,
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
    };
    await platform.connections.upsert(next);
    await platform.connections.activate(next.id);
    set({ connection: next, me: null });
    try {
      const me = await authedClient(platform).me();
      set({ status: 'ready', me });
    } catch (e) {
      set({ status: 'welcome', me: null });
      throw e;
    }
  },

  async signOut() {
    const { platform, connection } = get();
    if (!platform || !connection) {
      set({ status: 'welcome', me: null });
      return;
    }
    try {
      await authedClient(platform).logout();
    } catch {
      // The server may be unreachable or have dropped the session; local tokens go either way.
    }
    const cleared: Connection = { ...(get().connection ?? connection), access_token: null, refresh_token: null };
    await platform.connections.upsert(cleared);
    set({ connection: cleared, status: 'welcome', me: null });
  },

  async forget(id) {
    const { platform, connection } = get();
    if (!platform) return;
    await platform.connections.remove(id);
    if (connection?.id === id) set({ connection: null, status: 'welcome', me: null });
  },

  async saveTokens(connection, tokens) {
    const platform = get().platform;
    const next: Connection = { ...connection, ...tokens };
    set({ connection: next });
    await platform?.connections.upsert(next);
  },

  expire() {
    set({ status: 'welcome', me: null });
  },
}));
