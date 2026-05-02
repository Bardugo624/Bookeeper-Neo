// Bookeeper Mobile — fetch wrapper for the public bootstrap endpoints
// (no auth required) and the authenticated mobile API surface
// (`/api/v1/m/*`).
//
// Differs from the desktop client in two ways:
//   1. No mTLS (browsers can't present client certs for arbitrary fetch).
//      Auth is JWT bearer + an X-Device-Cert-Fingerprint header derived from
//      the stored cert; the Go middleware `mw/MobileAuthn` verifies both.
//   2. Network errors and HTTP errors share a single `ApiError` shape so the
//      UI can render a consistent retry path.
//
// On a 401 response from an authenticated request we silently try once with
// the refresh token (POST /api/v1/m/auth/refresh) and replay the original
// call before surfacing the error. This keeps the user inside the app when
// the access token has lapsed without requiring a re-pairing.

import { keystore } from './keystore';

export class ApiError extends Error {
    constructor(
        public status: number,
        public body: string,
    ) {
        super(`API ${status}: ${body}`);
        this.name = 'ApiError';
    }
}

/**
 * Origin of the API. Same-origin in production (PWA served by Go server),
 * configurable via VITE_API_BASE for local dev.
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** All authenticated mobile routes live under this prefix server-side. */
const MOBILE_PREFIX = '/api/v1/m';

interface RequestOpts {
    body?: unknown;
    /** When true (default), include Authorization + fingerprint headers. */
    auth?: boolean;
    /**
     * Bypassa la cache del service worker (SWR) per la chiamata corrente:
     * aggiunge l'header `X-Force-Refresh: 1` che il SW intercetta e
     * inoltra direttamente alla rete (NetworkOnly).
     */
    forceRefresh?: boolean;
    /** Internal: prevent infinite refresh loops. */
    _retried?: boolean;
}

async function request<T>(
    method: string,
    path: string,
    init: RequestOpts = {},
): Promise<T> {
    const auth = init.auth !== false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.forceRefresh) headers['X-Force-Refresh'] = '1';

    const creds = auth ? await keystore.load() : undefined;
    if (auth) {
        if (!creds) throw new ApiError(401, 'no credentials');
        headers['Authorization'] = `Bearer ${creds.accessToken}`;
        headers['X-Device-Cert-Fingerprint'] = creds.certFingerprint;
    }

    const url = `${API_BASE}${auth ? MOBILE_PREFIX : ''}${path}`;
    let res: Response;
    try {
        res = await fetch(url, {
            method,
            headers,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    } catch (err) {
        throw new ApiError(0, err instanceof Error ? err.message : 'network error');
    }

    // 401 on an authenticated call → try a single silent refresh and replay.
    if (res.status === 401 && auth && !init._retried && creds) {
        const refreshed = await tryRefresh(creds.refreshToken, creds.certFingerprint);
        if (refreshed) {
            return request<T>(method, path, { ...init, _retried: true });
        }
    }

    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text || res.statusText);
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

interface RefreshResp {
    access_token: string;
    refresh_token: string;
}

async function tryRefresh(refreshToken: string, fingerprint: string): Promise<boolean> {
    try {
        const r = await fetch(`${API_BASE}${MOBILE_PREFIX}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // No Authorization header — MobileAuthn lets /m/auth/refresh
                // through with only the fingerprint; the handler then
                // validates the refresh token from the body against the
                // device row already resolved by the middleware.
                'X-Device-Cert-Fingerprint': fingerprint,
            },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!r.ok) return false;
        const data = (await r.json()) as RefreshResp;
        await keystore.updateTokens(data.access_token, data.refresh_token);
        return true;
    } catch {
        return false;
    }
}

export const api = {
    get: <T>(path: string, opts?: { auth?: boolean; forceRefresh?: boolean }) =>
        request<T>('GET', path, { auth: opts?.auth, forceRefresh: opts?.forceRefresh }),
    post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
        request<T>('POST', path, { body, auth: opts?.auth }),
    patch: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
        request<T>('PATCH', path, { body, auth: opts?.auth }),
    delete: <T>(path: string, opts?: { auth?: boolean }) =>
        request<T>('DELETE', path, { auth: opts?.auth }),
};
