// Bookeeper Mobile — fetch wrapper for the public bootstrap endpoints
// (no auth required) and the authenticated mobile API surface.
//
// Differs from the desktop client in two ways:
// 1. No mTLS (browsers can't present client certs for arbitrary fetch).
//    Auth is JWT bearer + an X-Device-Cert-Fingerprint header derived from
//    the stored cert; server-side mobile auth middleware verifies both.
// 2. Network errors and HTTP errors share a single `ApiError` shape so the
//    UI can render a consistent retry path.

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

async function request<T>(
    method: string,
    path: string,
    init: { body?: unknown; auth?: boolean } = {},
): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (init.auth) {
        const creds = await keystore.load();
        if (!creds) throw new ApiError(401, 'no credentials');
        headers['Authorization'] = `Bearer ${creds.accessToken}`;
        // Server-side mobile authn uses fingerprint (sha256 of cert DER)
        // to bind the JWT to the issued device cert. Phase C will derive
        // this from creds.certPem; for Phase B we send a placeholder.
        // (Mobile API routes don't exist yet → header is forward-compat.)
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    } catch (err) {
        throw new ApiError(0, err instanceof Error ? err.message : 'network error');
    }

    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, text || res.statusText);
    return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
    get: <T>(path: string, opts?: { auth?: boolean }) =>
        request<T>('GET', path, { auth: opts?.auth }),
    post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
        request<T>('POST', path, { body, auth: opts?.auth }),
    patch: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
        request<T>('PATCH', path, { body, auth: opts?.auth }),
    delete: <T>(path: string, opts?: { auth?: boolean }) =>
        request<T>('DELETE', path, { auth: opts?.auth }),
};
