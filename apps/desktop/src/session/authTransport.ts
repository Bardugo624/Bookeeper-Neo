import { ApiError, createClient, type Transport } from '@bookeeper/api';
import type { Platform } from '../platform';
import { useSession } from './store';

const NO_RETRY = /\/auth\/(refresh|login|libraries)$|\/setup$|\/pairing\/redeem$/;

const RENEWABLE = new Set(['unauthorized', 'token_expired']);

/** Error code of a 401 response (JSON body or raw bytes); null when unreadable. */
function errorCode(res: { body?: unknown; bytes?: unknown }): string | null {
  try {
    let b: unknown = res.body;
    if (b === undefined && res.bytes instanceof Uint8Array) b = JSON.parse(new TextDecoder().decode(res.bytes));
    const code = (b as { error_code?: unknown } | null)?.error_code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
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
  let renewing: Promise<string | null> | null = null;
  // Refresh token whose renewal already failed: never retry the same stale token.
  let failedRefresh: string | null = null;

  const current = () => useSession.getState().connection;

  function renew(failedToken: string | null): Promise<string | null> {
    // Another request already renewed after this one was sent.
    const conn = current();
    if (conn && conn.access_token && conn.access_token !== failedToken) return Promise.resolve(conn.access_token);
    if (renewing) return renewing;
    renewing = (async () => {
      const c = current();
      if (!c?.refresh_token || c.refresh_token === failedRefresh) return null;
      try {
        const { session } = await createClient(platform.transport(c.id)).refresh(c.refresh_token);
        await useSession.getState().saveTokens(c, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          device_id: session.device_id,
        });
        return session.access_token;
      } catch (e) {
        // Only a server rejection makes the token stale; a network error may be transient.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) failedRefresh = c.refresh_token;
        return null;
      }
    })().finally(() => {
      renewing = null;
    });
    return renewing;
  }

  function withAuth(token: string | null, headers?: Record<string, string>) {
    return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
  }

  async function run<T extends { status: number }>(path: string, send: (h: (x?: Record<string, string>) => Record<string, string> | undefined) => Promise<T>): Promise<T> {
    const conn = current();
    if (!conn) throw new ApiError(0, 'no_connection', 'no active connection');
    const sentToken = conn.access_token;
    const res = await send((x) => withAuth(sentToken, x));
    if (res.status !== 401 || NO_RETRY.test(path)) return res;
    // Other 401s (wrong password, confirmation required) are ordinary errors for the caller.
    const code = errorCode(res as { body?: unknown; bytes?: unknown });
    if (code === 'device_revoked') {
      useSession.getState().expire();
      return res;
    }
    if (code !== null && !RENEWABLE.has(code)) return res;
    const fresh = await renew(sentToken);
    if (!fresh) {
      useSession.getState().expire();
      return res;
    }
    const retry = await send((x) => withAuth(fresh, x));
    if (retry.status === 401) useSession.getState().expire();
    return retry;
  }

  // The connection can change (sign-in elsewhere); resolve the base transport per call.
  const base = (): Transport => platform.transport(current()?.id);

  return {
    request: (method, path, body, headers) =>
      run(path, (h) => base().request(method, path, body, h(headers))),
    async requestRaw(req) {
      return run(req.path, (h) => {
        const t = base();
        if (!t.requestRaw) throw new ApiError(0, 'unsupported', 'raw requests unsupported');
        return t.requestRaw({ ...req, headers: h(req.headers) });
      });
    },
  };
}
