export interface TransportResponse {
  status: number;
  body: unknown;
  /** Seconds from the `Retry-After` header, when numeric. */
  retryAfter?: number;
}

export interface Transport {
  request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<TransportResponse>;
  /** Binary requests/responses (files). Optional: transports without it cannot move files. */
  requestRaw?(req: RawRequest): Promise<RawResponse>;
}

export interface RawRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: Uint8Array;
  contentType?: string;
  headers?: Record<string, string>;
}

export interface RawResponse {
  status: number;
  bytes: Uint8Array;
  contentType: string | null;
  /** Lower-case names; at least etag, content-disposition, x-labels-skipped, retry-after when present. */
  headers: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | undefined;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface FetchTransportOptions {
  getAccessToken?: () => string | null | Promise<string | null>;
}

function parseRetryAfter(v: string | null | undefined): number | undefined {
  if (v == null || !/^\s*\d+\s*$/.test(v)) return undefined;
  return Number(v);
}

const RAW_HEADERS = ['etag', 'content-disposition', 'x-labels-skipped', 'retry-after'];

export function createFetchTransport(
  baseUrl: string,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
  options: FetchTransportOptions = {},
): Transport {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    async request(method, path, body, extra) {
      let res: Response;
      let text: string;
      try {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(extra ?? {})) headers[k.toLowerCase()] = v;
        if (body !== undefined) headers['content-type'] = 'application/json';
        const token = options.getAccessToken ? await options.getAccessToken() : null;
        if (typeof token === 'string' && token !== '') headers.authorization = `Bearer ${token}`;
        res = await fetchImpl(`${base}${path}`, {
          method,
          headers: Object.keys(headers).length === 0 ? undefined : headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        text = await res.text();
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : 'network error');
      }
      let parsed: unknown = text;
      try {
        parsed = text === '' ? null : JSON.parse(text);
      } catch {
        parsed = text;
      }
      const retryAfter = parseRetryAfter(res.headers?.get('retry-after'));
      return retryAfter === undefined ? { status: res.status, body: parsed } : { status: res.status, body: parsed, retryAfter };
    },
    async requestRaw(req) {
      try {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = v;
        if (req.body !== undefined && req.contentType) headers['content-type'] = req.contentType;
        const token = options.getAccessToken ? await options.getAccessToken() : null;
        if (typeof token === 'string' && token !== '') headers.authorization = `Bearer ${token}`;
        const res = await fetchImpl(`${base}${req.path}`, {
          method: req.method,
          headers: Object.keys(headers).length === 0 ? undefined : headers,
          body: req.body === undefined ? undefined : (req.body as unknown as BodyInit),
        });
        const bytes = new Uint8Array(await res.arrayBuffer());
        const out: Record<string, string> = {};
        for (const name of RAW_HEADERS) {
          const v = res.headers?.get(name);
          if (v != null) out[name] = v;
        }
        return { status: res.status, bytes, contentType: res.headers?.get('content-type') ?? null, headers: out };
      } catch (e) {
        throw new ApiError(0, 'network', e instanceof Error ? e.message : 'network error');
      }
    },
  };
}
