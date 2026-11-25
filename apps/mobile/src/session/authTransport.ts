import { ApiError, createClient, type Transport } from '@bookeeper/api';
import type { Platform } from '../platform';
import { useSession } from './store';
import { readTokens } from './tokens';

/** A 401 on these paths is the answer to the request itself, never an expired token. */
const NO_RENEW = /\/auth\/(refresh|login)$|\/pairing\/redeem$/;

const RENEWABLE = new Set(['unauthorized', 'token_expired']);

/** Error code of a response: `body.error_code`, or the same JSON arriving as raw bytes; null when absent. */
function errorCode(res: { body?: unknown; bytes?: unknown }): string | null {
  try {
    let b: unknown = res.body;
    if (b === undefined && res.bytes && typeof (res.bytes as Uint8Array).byteLength === 'number') {
      b = JSON.parse(new TextDecoder().decode(res.bytes as Uint8Array));
    }
    const code = (b as { error_code?: unknown } | null)?.error_code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

/** `adopted`: the token came from another tab's renewal, not from our own refresh. */
/** A 401 that a new access token may cure (no code counts as renewable). */
function renewable(res: { body?: unknown; bytes?: unknown }): boolean {
  const code = errorCode(res);
  return code === null || RENEWABLE.has(code);
}

type Renewal = { token: string; adopted: boolean } | 'rejected' | 'unreachable';

interface LockManager {
  request<T>(name: string, cb: () => Promise<T>): Promise<T>;
}

/** Runs `fn` while holding a lock shared by every tab, so two tabs never refresh with the same token. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  return locks ? locks.request('bookeeper.mobile.refresh', fn) : fn();
}

const cache = new WeakMap<Platform, Transport>();

/** One transport per platform, so every client shares the same in-flight renewal. */
export function createAuthTransport(platform: Platform): Transport {
  let t = cache.get(platform);
  if (!t) {
    t = build(platform);
    cache.set(platform, t);
  }
  return t;
}

/**
 * Adds `Authorization` to every request, renews the token once on a 401 and retries.
 * Concurrent 401s share the same renewal.
 */
function build(platform: Platform): Transport {
  let renewing: Promise<Renewal> | null = null;

  /** Takes the tokens another tab stored, if it renewed (and rotated the refresh token) since we read ours. */
  function adoptStored(): void {
    const stored = readTokens(platform.storage);
    if (stored && stored.refresh_token !== useSession.getState().tokens?.refresh_token) {
      useSession.setState({ tokens: stored });
    }
  }

  /** A newer access token than `failedToken`: another request's or tab's, or a fresh refresh. */
  function newer(failedToken: string | null): Renewal | null {
    adoptStored();
    const now = useSession.getState().tokens;
    return now && now.access_token !== failedToken ? { token: now.access_token, adopted: true } : null;
  }

  function renew(failedToken: string | null): Promise<Renewal> {
    const found = newer(failedToken);
    if (found) return Promise.resolve(found);
    if (renewing) return renewing;
    renewing = withRefreshLock(async (): Promise<Renewal> => {
      // Another tab may have refreshed while we waited for the lock.
      const meanwhile = newer(failedToken);
      if (meanwhile) return meanwhile;
      const tokens = useSession.getState().tokens;
      if (!tokens) return 'rejected';
      try {
        const { session } = await createClient(platform.transport()).refresh(tokens.refresh_token);
        useSession.getState().saveTokens({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          device_id: session.device_id,
        });
        return { token: session.access_token, adopted: false };
      } catch (e) {
        // Only a server rejection ends the session; a network error may be transient.
        return e instanceof ApiError && e.status >= 400 && e.status < 500 ? 'rejected' : 'unreachable';
      }
    }).finally(() => {
      renewing = null;
    });
    return renewing;
  }

  const withAuth = (token: string | null, headers?: Record<string, string>) =>
    token ? { ...headers, Authorization: `Bearer ${token}` } : headers;

  /** Sends with the current token; on a renewable 401 renews once (shared) and retries. */
  async function run<T extends { status: number; body?: unknown; bytes?: unknown }>(
    path: string,
    send: (token: string | null) => Promise<T>,
  ): Promise<T> {
    const sent = useSession.getState().tokens?.access_token ?? null;
    const res = await send(sent);
    if (res.status !== 401 || NO_RENEW.test(path) || sent === null) return res;
    const code = errorCode(res);
    if (code === 'device_revoked') {
      useSession.getState().expire();
      return res;
    }
    // Other 401s (wrong credentials, confirmation needed) are ordinary errors for the caller.
    if (!renewable(res)) return res;
    let renewal = await renew(sent);
    let retry: T | null = null;
    for (let tries = 1; ; tries++) {
      // The session may still be good: report it as a network failure, not as a 401.
      if (renewal === 'unreachable') throw new ApiError(0, 'network', 'The server could not be reached');
      if (renewal === 'rejected') {
        useSession.getState().expire();
        return retry ?? res;
      }
      retry = await send(renewal.token);
      // A token taken from another tab may itself have expired: refresh with its refresh token.
      if (!renewal.adopted || tries >= 3 || retry.status !== 401 || !renewable(retry)) break;
      renewal = await renew(renewal.token);
    }
    if (retry.status === 401) useSession.getState().expire();
    return retry;
  }

  return {
    request: (method, path, body, headers) =>
      run(path, (token) => platform.transport().request(method, path, body, withAuth(token, headers))),
    requestRaw: (req) =>
      run(req.path, (token) => {
        const base = platform.transport();
        if (!base.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
        return base.requestRaw({ ...req, headers: withAuth(token, req.headers) });
      }),
  };
}
