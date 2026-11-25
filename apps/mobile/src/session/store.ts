import { create } from 'zustand';
import { ApiError, createClient, type AuthOut, type MeOut } from '@bookeeper/api';
import type { Platform } from '../platform';
import { createAuthTransport } from './authTransport';
import { clearTokens, readTokens, writeTokens, type Tokens } from './tokens';

export type SessionStatus = 'loading' | 'unpaired' | 'ready';

export interface SessionState {
  status: SessionStatus;
  tokens: Tokens | null;
  me: MeOut | null;
  platform: Platform | null;
  /** Reads the stored tokens and, with a token, confirms the session with `GET /me`. */
  init(platform: Platform): Promise<void>;
  /** Stores the tokens of a freshly paired device. */
  signIn(auth: AuthOut): Promise<void>;
  /** Asks the server to end the session, then forgets the tokens either way. */
  signOut(): Promise<void>;
  /** Stores renewed tokens. Used by the authenticated transport. */
  saveTokens(tokens: Tokens): void;
  /** The session cannot be renewed: tokens are erased and the phone must pair again. */
  expire(): void;
}

const INITIAL = { status: 'loading', tokens: null, me: null, platform: null } as const;

// The transport reads this store back, but only at call time, so the import cycle is safe.
const authedClient = (platform: Platform) => createClient(createAuthTransport(platform));

/** Errors that say nothing about the session: no network, or a server having a bad moment. */
const transient = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500);

export const useSession = create<SessionState>((set, get) => ({
  ...INITIAL,

  async init(platform) {
    set({ ...INITIAL, platform });
    const tokens = readTokens(platform.storage);
    if (!tokens) {
      set({ status: 'unpaired' });
      return;
    }
    set({ tokens });
    try {
      const me = await authedClient(platform).me();
      // A rejected renewal during `me` already moved the store to `unpaired`.
      if (get().status === 'loading') set({ status: 'ready', me });
    } catch (e) {
      if (get().status !== 'loading') return;
      // Offline at launch: keep the session; the views show what they have.
      if (transient(e)) set({ status: 'ready' });
      else get().expire();
    }
  },

  async signIn(auth) {
    const platform = get().platform;
    if (!platform) throw new Error('session not initialised');
    const tokens: Tokens = {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      device_id: auth.session.device_id,
    };
    writeTokens(platform.storage, tokens);
    set({ tokens, me: null });
    try {
      const me = await authedClient(platform).me();
      set({ status: 'ready', me });
    } catch (e) {
      get().expire();
      throw e;
    }
  },

  async signOut() {
    const platform = get().platform;
    if (platform && get().tokens) {
      try {
        await authedClient(platform).logout();
      } catch {
        // The server may be unreachable or have dropped the session; local tokens go either way.
      }
    }
    get().expire();
  },

  saveTokens(tokens) {
    const platform = get().platform;
    if (platform) writeTokens(platform.storage, tokens);
    set({ tokens });
  },

  expire() {
    const platform = get().platform;
    if (platform) clearTokens(platform.storage);
    set({ status: 'unpaired', tokens: null, me: null });
  },
}));
