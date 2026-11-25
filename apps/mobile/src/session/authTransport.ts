import { ApiError, createClient, type Transport } from '@bookeeper/api';
import type { Platform } from '../platform';
import { useSession } from './store';

/** A 401 on these paths is the answer to the request itself, never an expired token. */
const NO_RENEW = /\/auth\/(refresh|login)$|\/pairing\/redeem$/;

const RENEWABLE = new Set(['unauthorized', 'token_expired']);

/** Error code of a response (`body.error_code`); null when absent. */
function errorCode(body: unknown): string | null {
  const code = (body as { error_code?: unknown } | null)?.error_code;
  return typeof code === 'string' ? code : null;
}

type Renewal = { token: string } | 'rejected' | 'unreachable';

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

  function renew(failedToken: string | null): Promise<Renewal> {
    // Another request already renewed after this one was sent.
    const now = useSession.getState().tokens;
    if (now && now.access_token !== failedToken) return Promise.resolve({ token: now.access_token });
    if (renewing) return renewing;
    renewing = (async (): Promise<Renewal> => {
      const tokens = useSession.getState().tokens;
      if (!tokens) return 'rejected';
      try {
        const { session } = await createClient(platform.transport()).refresh(tokens.refresh_token);
        useSession.getState().saveTokens({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          device_id: session.device_id,
        });
        return { token: session.access_token };
      } catch (e) {
        // Only a server rejection ends the session; a network error may be transient.
        return e instanceof ApiError && e.status >= 400 && e.status < 500 ? 'rejected' : 'unreachable';
      }
    })().finally(() => {
      renewing = null;
    });
    return renewing;
  }

  const withAuth = (token: string | null, headers?: Record<string, string>) =>
    token ? { ...headers, Authorization: `Bearer ${token}` } : headers;

  return {
    async request(method, path, body, headers) {
      const sent = useSession.getState().tokens?.access_token ?? null;
      const send = (token: string | null) => platform.transport().request(method, path, body, withAuth(token, headers));
      const res = await send(sent);
      if (res.status !== 401 || NO_RENEW.test(path) || sent === null) return res;
      const code = errorCode(res.body);
      if (code === 'device_revoked') {
        useSession.getState().expire();
        return res;
      }
      // Other 401s (wrong credentials, confirmation needed) are ordinary errors for the caller.
      if (code !== null && !RENEWABLE.has(code)) return res;
      const renewal = await renew(sent);
      if (renewal === 'unreachable') return res;
      if (renewal === 'rejected') {
        useSession.getState().expire();
        return res;
      }
      const retry = await send(renewal.token);
      if (retry.status === 401) useSession.getState().expire();
      return retry;
    },
  };
}
