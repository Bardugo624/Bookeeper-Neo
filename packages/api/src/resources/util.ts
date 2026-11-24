import type { components } from '../schema';
import { ApiError, type Transport, type TransportResponse } from '../transport';

export type S = components['schemas'];
export type { Transport };

export const P = '/api/v1';

export function isErrorBody(b: unknown): b is components['schemas']['ApiErrorBody'] {
  return (
    typeof b === 'object' &&
    b !== null &&
    typeof (b as Record<string, unknown>).error_code === 'string' &&
    typeof (b as Record<string, unknown>).message === 'string'
  );
}

export function fail(r: TransportResponse): never {
  if (isErrorBody(r.body)) {
    throw new ApiError(r.status, r.body.error_code, r.body.message, r.status === 429 ? r.retryAfter : undefined);
  }
  throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`, r.status === 429 ? r.retryAfter : undefined);
}

export function unwrap<T>(r: TransportResponse): T {
  if (r.status >= 200 && r.status < 300) {
    // A proxy or SPA fallback can answer 200 with HTML: never pass that off as data.
    if (typeof r.body !== 'object' || r.body === null) {
      throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`);
    }
    return r.body as T;
  }
  return fail(r);
}

export function unwrapEmpty(r: TransportResponse): void {
  if (r.status >= 200 && r.status < 300) return;
  fail(r);
}

export function enc(id: string): string {
  return encodeURIComponent(id);
}

/** Builds `?a=1&b=2`; `undefined`/`null` values are omitted, no `?` when empty. */
export function qs(params?: object): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

import type { RawRequest, RawResponse } from '../transport';

export async function raw(t: Transport, req: RawRequest): Promise<RawResponse> {
  if (!t.requestRaw) throw new ApiError(0, 'raw_unsupported', 'This transport cannot send or receive files');
  return t.requestRaw(req);
}

/** Returns the response when 2xx; otherwise throws the same ApiError a JSON request would. */
export function okRaw(r: RawResponse): RawResponse {
  if (r.status >= 200 && r.status < 300) return r;
  let body: unknown = null;
  try {
    body = JSON.parse(new TextDecoder().decode(r.bytes));
  } catch {
    body = null;
  }
  const ra = r.headers['retry-after'];
  const retryAfter = ra != null && /^\s*\d+\s*$/.test(ra) ? Number(ra) : undefined;
  return fail({ status: r.status, body, ...(retryAfter === undefined ? {} : { retryAfter }) });
}

export function parseJsonRaw<T>(r: RawResponse): T {
  okRaw(r);
  try {
    return JSON.parse(new TextDecoder().decode(r.bytes)) as T;
  } catch {
    throw new ApiError(r.status, 'unknown', `Unexpected response (${r.status})`);
  }
}

export function filenameOf(r: RawResponse, fallback: string): string {
  const cd = r.headers['content-disposition'];
  if (!cd) return fallback;
  const star = /filename\*\s*=\s*(?:[\w-]+)?''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const m = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(cd);
  const n = (m?.[1] ?? m?.[2] ?? '').trim();
  return n === '' ? fallback : n;
}

export const JSON_CT = 'application/json';
export const encodeJson = (v: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(v));
